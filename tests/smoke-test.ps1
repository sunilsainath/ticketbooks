# End-to-end smoke test of the most important flows
$ErrorActionPreference = "Stop"
$base = "http://localhost:3100"

function Login($email) {
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $body = @{ email = $email; password = "Password123!" } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -Body $body -ContentType "application/json" -WebSession $s
  return @{ Session = $s; User = $r }
}

function Api($sess, $method, $path, $bodyObj) {
  $args = @{ Uri = "$base$path"; Method = $method; WebSession = $sess.Session; SkipHttpErrorCheck = $true }
  if ($bodyObj) { $args.Body = ($bodyObj | ConvertTo-Json -Depth 8); $args.ContentType = "application/json" }
  return Invoke-RestMethod @args
}

Write-Output "== 1. Manager login =="
$meera = Login "meera@strike.io"
Write-Output ("logged in as {0} {1} ({2})" -f $meera.User.firstName, $meera.User.lastName, $meera.User.roleName)

Write-Output "`n== 2. Load meta =="
$meta = Api $meera GET "/api/meta"
$proj = $meta.projects | Where-Object key -eq "OPS"
$type = $meta.types | Where-Object name -eq "Task"
$prio = $meta.priorities | Where-Object name -eq "High"
$statusDefault = $meta.statuses | Where-Object isDefault
$rahul = $meta.users | Where-Object email -eq "rahul@strike.io"
Write-Output ("project={0} type={1} assignee={2}" -f $proj.key, $type.name, $rahul.email)

Write-Output "`n== 3. Manager creates + assigns ticket =="
$due = (Get-Date).AddDays(3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$created = Api $meera POST "/api/tickets" @{
  projectId = $proj.id; typeId = $type.id; priorityId = $prio.id; statusId = $statusDefault.id
  title = "Smoke test ticket from E2E script"; description = "<p>Created by the automated smoke test.</p>"
  assigneeId = $rahul.id; dueDate = $due; storyPoints = 3
}
$tkey = $created.key
Write-Output ("created ticket {0}" -f $tkey)
if (-not $tkey) { throw "ticket creation failed: $($created | ConvertTo-Json)" }

Write-Output "`n== 4. Employee sees in-app notification about assignment =="
Start-Sleep -Milliseconds 600
$rahulSess = Login "rahul@strike.io"
$notifs = Api $rahulSess GET "/api/notifications?page=1"
$assignedNotif = $notifs.items | Where-Object { $_.title -like "*assigned*" -and $_.ticket.key -eq $tkey } | Select-Object -First 1
if ($assignedNotif) { Write-Output ("notification OK: '{0}'" -f $assignedNotif.title) } else { Write-Output "WARN: no assignment notification found"; $notifs.items | Select-Object -First 3 title | Format-Table }

Write-Output "`n== 5. Email was queued for the assignment =="
# console provider prints to server log AND records an EmailEvent row
$emailRows = docker exec strike-db psql -U postgres -d ticketing -t -c "SELECT count(*) FROM `"EmailEvent`" WHERE `"recipients`"='rahul@strike.io' AND `"templateKey`"='ticket_assigned';"
Write-Output ("assignment email rows for rahul: {0}" -f ([int]($emailRows | ForEach-Object { $_.Trim() } | Select-Object -First 1)))

Write-Output "`n== 6. Second employee tries to view the assigned ticket (scope check) =="
$arjunSess = Login "arjun@strike.io"
$detail = Invoke-RestMethod -Uri "$base/api/tickets/$tkey" -WebSession $arjunSess.Session -SkipHttpErrorCheck
Write-Output ("arjun GET detail status code path returned: {0}" -f ($detail.error ?? "accessible"))

Write-Output "`n== 7. Claim race: create unassigned ticket then two employees claim it =="
$unassigned = Api $meera POST "/api/tickets" @{
  projectId = $proj.id; typeId = $type.id; priorityId = $prio.id; statusId = $statusDefault.id
  title = "Unassigned claim-race ticket"
}
$ukey = $unassigned.key
Write-Output ("unassigned ticket {0}" -f $ukey)

$claimTaskA = Start-Job -ScriptBlock {
  param($b, $k) 
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod -Uri "$b/api/auth/login" -Method Post -Body (@{ email="rahul@strike.io"; password="Password123!" } | ConvertTo-Json) -ContentType "application/json" -WebSession $s | Out-Null
  try { Invoke-RestMethod -Uri "$b/api/tickets/$k/claim" -Method Post -WebSession $s | ConvertTo-Json -Compress } catch { $_.ErrorDetails.Message }
} -ArgumentList $base, $ukey
$claimTaskB = Start-Job -ScriptBlock {
  param($b, $k)
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod -Uri "$b/api/auth/login" -Method Post -Body (@{ email="arjun@strike.io"; password="Password123!" } | ConvertTo-Json) -ContentType "application/json" -WebSession $s | Out-Null
  try { Invoke-RestMethod -Uri "$b/api/tickets/$k/claim" -Method Post -WebSession $s | ConvertTo-Json -Compress } catch { $_.ErrorDetails.Message }
} -ArgumentList $base, $ukey
$resA = Receive-Job $claimTaskA -Wait
$resB = Receive-Job $claimTaskB -Wait
Remove-Job $claimTaskA, $claimTaskB
Write-Output ("claim A result: {0}" -f ($resA | Out-String).Trim().Substring(0, [Math]::Min(120, ($resA | Out-String).Trim().Length)))
Write-Output ("claim B result: {0}" -f ($resB | Out-String).Trim().Substring(0, [Math]::Min(160, ($resB | Out-String).Trim().Length)))

Write-Output "`n== 8. Winner's status change records history + notifies stakeholders =="
$winnerSess = if ("$resA" -match '"key"') { $rahulSess } else { $arjunSess }
$inProgress = (Api $meera GET "/api/meta").statuses | Where-Object name -eq "In Progress"
$patched = Api $winnerSess PATCH "/api/tickets/$ukey" @{ statusId = $inProgress.id }
if ($patched.error) { Write-Output "PATCH failed: $($patched.error)" } else { Write-Output ("status now: {0}" -f $patched.status.name) }

Write-Output "`n== 9. Comment with @mention notifies manager =="
$cmt = Api $winnerSess POST "/api/tickets/$ukey/comments" @{ body = "<p>@Meera started on this, ETA tomorrow.</p>" }
if ($cmt.id) { Write-Output ("comment created: {0}" -f $cmt.id.Substring(0,12)) } else { Write-Output "comment FAILED: $($cmt.error)" }
$meeraNotifs = Api $meera GET "/api/notifications?page=1"
$mNotif = $meeraNotifs.items | Where-Object { $_.ticket.key -eq $ukey } | Select-Object -First 1
if ($mNotif) { Write-Output ("manager notification: '{0}' ({1})" -f $mNotif.title, $mNotif.type) } else { Write-Output "manager notification missing!" }

Write-Output "`n== 10. Ticket history trail =="
$detailM = Api $meera GET "/api/tickets/$ukey"
Write-Output ("history entries: {0}" -f $detailM.history.Count)
$detailM.history | Select-Object -First 6 | ForEach-Object { Write-Output (" - [{0}] {1}: {2}" -f $_.field, $_.user.firstName, ($_.newValue ?? "")) }

Write-Output "`n== 11. Watch toggle =="
Api $meera POST "/api/tickets/$ukey/watch" | Out-Null
$d2 = Api $meera GET "/api/tickets/$ukey"
Write-Output ("watchers after watch: {0}" -f ($d2.ticket.watchers | Measure-Object).Count)

Write-Output "`n== 12. Dashboard aggregation works =="
$dash = Api $meera GET "/api/dashboard"
Write-Output ("dashboard view={0} totalOpen={1} unassigned={2} overdue={3}" -f $dash.view, $dash.cards.totalOpen, $dash.cards.unassigned, $dash.cards.overdue)

Write-Output "`n== 13. RBAC: employee cannot manage users =="
$forbiddenUsers = Api $rahulSess GET "/api/users?pageSize=5"
Write-Output ("employee GET /api/users -> {0}" -f ($forbiddenUsers.error ?? "allowed"))

Write-Output "`n== 14. Search finds tickets =="
$search = Api $meera GET "/api/search?q=SSO"
Write-Output ("search 'SSO' hits: {0} first: {1}" -f $search.total, ($search.tickets | Select-Object -First 1).key)
$searchKey = Api $meera GET "/api/search?q=$tkey"
Write-Output ("search by exact key: {0}" -f ($searchKey.tickets | Select-Object -First 1).key)

Write-Output "`nSMOKE TEST COMPLETE"
