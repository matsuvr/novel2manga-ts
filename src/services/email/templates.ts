import { routesConfig } from '@/config/routes.config'
import type { JobNotificationData } from './types'

export const generateJobNotificationContent = (data: JobNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  const jobUrl = `${baseUrl}/portal/jobs/${data.jobId}`
  const dashboardUrl = `${baseUrl}${routesConfig.portal.dashboard}`
  const isCompleted = data.status === 'completed'

  const subject = isCompleted
    ? '漫画のコマ割りが完了しました - Novel2Manga'
    : '漫画のコマ割りでエラーが発生しました - Novel2Manga'
  const title = isCompleted ? '漫画のコマ割りが完了しました' : '漫画のコマ割りでエラーが発生しました'
  const message = isCompleted
    ? 'お疲れ様です！あなたの小説の漫画のコマ割り処理が正常に完了しました。'
    : '申し訳ございません。あなたの小説の漫画のコマ割り処理中にエラーが発生しました。'

  const action = isCompleted
    ? { url: jobUrl, label: '結果を確認する', color: '#4CAF50' }
    : { url: dashboardUrl, label: 'マイページを開く', color: '#f44336' }

  const errorDetailHtml =
    !isCompleted && data.errorMessage
      ? `<p><strong>エラー詳細:</strong> ${data.errorMessage}</p>`
      : ''
  const errorDetailText =
    !isCompleted && data.errorMessage ? `エラー詳細: ${data.errorMessage}\n` : ''

  const footerHtml = isCompleted
    ? 'このメールは自動送信されています。返信はできません。'
    : 'マイページでエラー内容を確認し、ジョブを再開するか選択できます。<br>問題が解決しない場合は、サポートまでお問い合わせください。<br>このメールは自動送信されています。返信はできません。'

  const textActionLine = isCompleted
    ? `結果を確認するには以下のURLにアクセスしてください：\n${jobUrl}\n\n`
    : `マイページでエラー内容を確認し、ジョブを再開できます：\n${dashboardUrl}\n\n問題が解決しない場合は、サポートまでお問い合わせください。\n`

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: ${action.color};">${title}</h2>
  <p>${message}</p>
  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>ジョブID:</strong> ${data.jobId}</p>
    ${errorDetailHtml}
  </div>
  <p><a href="${action.url}" style="background-color: ${action.color}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">${action.label}</a></p>
  <p style="color: #666; font-size: 14px; margin-top: 30px;">${footerHtml}</p>
</div>
  `.trim()

  const text =
    `${title}\n\n${message}\n\nジョブID: ${data.jobId}\n${errorDetailText}${textActionLine}このメールは自動送信されています。`.trim()

  return { subject, html, text }
}

export type JobNotificationContent = ReturnType<typeof generateJobNotificationContent>
