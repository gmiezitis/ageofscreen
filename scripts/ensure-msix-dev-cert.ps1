param(
    [Parameter(Mandatory = $true)]
    [string]$CertFile,

    [Parameter(Mandatory = $true)]
    [string]$CertPassword,

    [Parameter(Mandatory = $true)]
    [string]$PublisherName,

    [string]$CerFile = ""
)

$ErrorActionPreference = "Stop"

$subjectName = "CN=$PublisherName"
$friendlyName = "ELECTRON WINDOWS MSIX Dev Cert ($subjectName)"
$yearsValid = 99
$certDirectory = Split-Path -Parent $CertFile
if (-not (Test-Path $certDirectory)) {
    New-Item -ItemType Directory -Path $certDirectory -Force | Out-Null
}

if (Test-Path $CertFile) {
    Remove-Item -Path $CertFile -Force
}

$cerDirectory = if ($CerFile) { Split-Path -Parent $CerFile } else { $null }
if ($cerDirectory -and -not (Test-Path $cerDirectory)) {
    New-Item -ItemType Directory -Path $cerDirectory -Force | Out-Null
}

if ($CerFile -and (Test-Path $CerFile)) {
    Remove-Item -Path $CerFile -Force
}

$securePassword = ConvertTo-SecureString -String $CertPassword -AsPlainText -Force

$existingCert = Get-ChildItem -Path "Cert:\CurrentUser\My" |
    Where-Object {
        $_.Subject -eq $subjectName -and $_.FriendlyName -eq $friendlyName
    }

if ($existingCert) {
    $cert = $existingCert | Sort-Object NotAfter -Descending | Select-Object -First 1
} else {
    $cert = New-SelfSignedCertificate `
        -FriendlyName $friendlyName `
        -DnsName "electron.windows.msix.dev" `
        -Subject $subjectName `
        -KeyExportPolicy Exportable `
        -KeyLength 2048 `
        -KeyUsage DigitalSignature `
        -Type CodeSigning `
        -KeySpec Signature `
        -NotAfter (Get-Date).AddYears($yearsValid) `
        -CertStoreLocation "Cert:\CurrentUser\My"
}

if ($CerFile) {
    Export-Certificate -Cert $cert -FilePath $CerFile | Out-Null
}

Export-PfxCertificate -Cert $cert -FilePath $CertFile -Password $securePassword | Out-Null
Write-Output $cert.Thumbprint
