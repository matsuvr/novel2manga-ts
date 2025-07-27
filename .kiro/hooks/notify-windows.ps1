# Windows通知を表示するPowerShellスクリプト
param(
    [string]$Title = "Claude Code",
    [string]$Message = "確認が必要です"
)

# Windows.UI.Notificationsを使用
Add-Type -AssemblyName Windows.Data
Add-Type -AssemblyName Windows.UI

# XMLテンプレートを作成
$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>$Title</text>
            <text>$Message</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default"/>
</toast>
"@

# 通知を作成して表示
try {
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude Code")
    $notifier.Show($toast)
    
    Write-Host "通知を送信しました: $Message"
} catch {
    Write-Error "通知の送信に失敗しました: $_"
}