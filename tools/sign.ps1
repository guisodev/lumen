# Firma uno o varios archivos con Authenticode (lo usa tools/build.py, también
# para el instalador y el desinstalador a través de Inno Setup).
#
# El certificado se elige con variables de entorno:
#   LUMEN_SIGN_THUMBPRINT   huella de un certificado de firma de código ya
#                           instalado en el almacén del usuario (Cert:\CurrentUser\My).
#                           Sirve para un .pfx importado y para los certificados en
#                           la nube o en token (Certum SimplySign, por ejemplo).
#   LUMEN_SIGN_PFX          o bien la ruta a un .pfx, con
#   LUMEN_SIGN_PASSWORD     su contraseña.
#   LUMEN_SIGN_TIMESTAMP    servidor de sellado de tiempo (opcional; por defecto
#                           el de DigiCert). Con sello, la firma sigue siendo válida
#                           aunque el certificado caduque después.
param([Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Files)
$ErrorActionPreference = 'Stop'

if ($env:LUMEN_SIGN_THUMBPRINT) {
    $cert = Get-Item "Cert:\CurrentUser\My\$($env:LUMEN_SIGN_THUMBPRINT -replace '\s', '')"
} elseif ($env:LUMEN_SIGN_PFX) {
    $pass = ConvertTo-SecureString $env:LUMEN_SIGN_PASSWORD -AsPlainText -Force
    $cert = Get-PfxCertificate -FilePath $env:LUMEN_SIGN_PFX -Password $pass
} else {
    throw 'Falta el certificado: define LUMEN_SIGN_THUMBPRINT o LUMEN_SIGN_PFX.'
}
$timestamp = if ($env:LUMEN_SIGN_TIMESTAMP) { $env:LUMEN_SIGN_TIMESTAMP } else { 'http://timestamp.digicert.com' }

foreach ($file in $Files) {
    $r = Set-AuthenticodeSignature -FilePath $file -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $timestamp
    if ($r.Status -ne 'Valid' -and $r.Status -ne 'UnknownError') {
        throw "No se pudo firmar ${file}: $($r.StatusMessage)"
    }
    # UnknownError = firmado, pero con un certificado en el que Windows aún no confía
    # (p. ej. uno de prueba autofirmado). La firma está puesta igualmente.
    Write-Host "Firmado: $file ($($r.Status))"
}
