$body = @{
  username = "test_noemail_" + (Get-Random)
  email = $null
  full_name = "Test No Email"
  password = "123456"
  role = "user"
  is_active = 1
} | ConvertTo-Json -Compress

try {
  $response = Invoke-RestMethod -Uri "http://localhost:3000/api/users" -Method Post -ContentType "application/json" -Body $body
  $response | ConvertTo-Json -Depth 6
} catch {
  Write-Error $_
  exit 1
}
