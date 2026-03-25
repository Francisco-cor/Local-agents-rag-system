function Get-ExpectedScore($ratingA, $ratingB) {
    return 1.0 / (1.0 + [Math]::Pow(10, ($ratingB - $ratingA) / 400.0))
}

function Calculate-NewRating($rating, $expected, $actual, $kFactor) {
    return $rating + $kFactor * ($actual - $expected)
}

$kFactor = 32.0
$ra = 1000.0
$rb = 1000.0

Write-Host "🏟️ Testing Arena ELO Logic..."
Write-Host "Initial Ratings: ModelA=$ra, ModelB=$rb"

# Simulate ModelA winning
$ea = Get-ExpectedScore $ra $rb
$eb = Get-ExpectedScore $rb $ra

$sa = 1.0 # Actual score for A
$sb = 0.0 # Actual score for B

$newRa = Calculate-NewRating $ra $ea $sa $kFactor
$newRb = Calculate-NewRating $rb $eb $sb $kFactor

Write-Host "Match Result: ModelA wins!"
Write-Host "Expected Scores: Ea=$($ea.ToString('F4')), Eb=$($eb.ToString('F4'))"
Write-Host "New Ratings: ModelA=$($newRa.ToString('F2')), ModelB=$($newRb.ToString('F2'))"

if ($newRa -gt $ra -and $newRb -lt $rb) {
    Write-Host "✅ ELO Logic Verified (Ratings updated correctly)"
} else {
    Write-Host "❌ ELO Logic Failed (Ratings did not update as expected)"
}
