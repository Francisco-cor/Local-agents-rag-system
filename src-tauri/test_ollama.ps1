$responseTags = curl.exe -s http://localhost:11434/api/tags
if ($null -eq $responseTags -or $responseTags -eq "") {
    Write-Host "❌ Could not reach Ollama API"
    exit
}

$modelsJson = $responseTags | ConvertFrom-Json
Write-Host "📡 Available Models:"
foreach ($m in $modelsJson.models) {
    Write-Host "- $($m.name)"
}

$testModel = $modelsJson.models[0].name
Write-Host "`n🤖 Testing Inference with model '$testModel'..."

$requestBody = @{
    model = $testModel
    messages = @(
        @{ role = "user"; content = "Say hello in one word." }
    )
    stream = $false
} | ConvertTo-Json -Compress

$responseChat = curl.exe -s -X POST http://localhost:11434/api/chat -H "Content-Type: application/json" -d $requestBody
$chatJson = $responseChat | ConvertFrom-Json

if ($null -ne $chatJson.message.content) {
    Write-Host "Ollama says: $($chatJson.message.content)"
    Write-Host "✅ Inference Verified!"
} else {
    Write-Host "❌ Inference Failed!"
    Write-Host "Response: $responseChat"
}
