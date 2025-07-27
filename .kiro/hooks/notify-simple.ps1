# シンプルなWindows通知スクリプト（Windows 10/11向け）
param(
    [string]$Title = "Claude Code",
    [string]$Message = "確認が必要です"
)

# BurntToastモジュールを使用しない簡易版
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] > $null

# XMLテンプレート
$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>$Title</text>
            <text>$Message</text>
        </binding>
    </visual>
    <actions>
        <action content="確認する" arguments="check" />
    </actions>
    <audio src="ms-winsoundevent:Notification.Default"/>
</toast>
"@

try {
    # XMLドキュメントを作成
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    
    # 通知を作成
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
    
    # アプリケーションIDを設定（PowerShell用）
    $AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    
    # 通知を表示
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)
    
    Write-Host "通知を送信しました: $Title - $Message"
    exit 0
} catch {
    Write-Error "通知の送信に失敗しました: $_"
    
    # フォールバック: Windows Script Hostを使用
    try {
        $wshell = New-Object -ComObject Wscript.Shell
        $wshell.Popup($Message, 0, $Title, 64)
    } catch {
        Write-Error "フォールバック通知も失敗しました: $_"
    }
    exit 1
}