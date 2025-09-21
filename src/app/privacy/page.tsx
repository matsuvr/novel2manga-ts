import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Novel2Manga',
  description: 'Novel2Mangaのプライバシーポリシーをご確認ください。',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <article id="privacy" lang="ja" className="prose prose-lg max-w-none">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">プライバシーポリシー</h1>
          <p className="text-gray-600">最終更新日：2025年9月21日</p>
        </header>

        <p className="text-gray-700 leading-relaxed mb-6">
          M.A（以下「当サークル」）は、当サークルが提供するNovel2Manga（以下「本サービス」）におけるユーザーの個人情報等の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. 適用範囲</h2>
          <p className="text-gray-700">本ポリシーは、本サービスにおいて当サークルが取得する情報の取扱いに適用されます。外部サービスにおける取扱いは、各事業者のポリシーに従います。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. 取得する情報</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>アカウント情報：メールアドレス、表示名、認証情報、プロフィール等</li>
            <li>利用情報：アクセス日時、IPアドレス、デバイス情報、OS・ブラウザ情報、リファラ、Cookie/類似技術の識別子、操作ログ、エラーログ</li>
            <li>コンテンツ情報：ユーザーが本サービスに入力・送信・保存・アップロードするデータ（以下「ユーザーコンテンツ」）</li>
            <li>取引情報：有償機能の利用履歴、支払に関する情報（決済は外部事業者で処理される場合があります）</li>
            <li>問い合わせ情報：問い合わせ内容、送受信記録等</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. 取得方法</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>ユーザーの入力、登録、問い合わせ等による取得</li>
            <li>自動取得：Cookie/ローカルストレージ、アクセス解析タグ、ログ収集基盤等</li>
            <li>外部連携：ユーザーが許可した外部サービスからの受領（例：OAuthによる基本プロフィール）</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. 利用目的</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>本サービスの提供、維持、本人確認、不正利用防止</li>
            <li>問い合わせ・サポート対応、重要なお知らせの送付</li>
            <li>機能改善、品質向上、研究開発、パフォーマンス最適化、障害解析、セキュリティ対策</li>
            <li>統計的・分析的利用（匿名化・集計化を含む）</li>
            <li>有料サービスの課金・請求・返金対応</li>
            <li>利用規約違反・法令違反への対応、紛争の解決</li>
            <li>本ポリシーまたは個別の同意で明示したその他の目的</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. ユーザーコンテンツの閲覧と活用（重要）</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>当サークル（開発者）は、品質改善・不具合調査・不正検知・研究開発等の目的で、ユーザーコンテンツを閲覧・確認する場合があります（人手レビューを含みます）。</li>
            <li>当サークルは、ユーザーコンテンツを上記目的の範囲で、複製、解析、改変、保存、機械学習等の開発に活用することがあります。</li>
            <li>個人情報や機微情報を含めたくない場合は、入力前に内容をご確認ください。業務上の秘密・第三者の権利を含むデータの取扱いはユーザーの責任となります。</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. 法令上の根拠</h2>
          <p className="text-gray-700">当サークルは、日本の個人情報保護法その他関係法令に従い、適正に個人情報を取扱います。海外ユーザー向けにGDPR等が適用され得る場合は、ユーザーの同意、契約履行、正当な利益等の法的根拠に基づき処理します。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Cookie等の利用</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>認証、セッション管理、利便性向上、トラフィック測定・分析のためにCookie/類似技術を使用します。</li>
            <li>ブラウザ設定でCookieを無効化できますが、本サービスの一部機能が利用できなくなる場合があります。</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. 第三者提供・業務委託</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>次の場合を除き、本人の同意なく個人情報を第三者へ提供しません：法令に基づく場合、生命・身体・財産の保護に必要な場合、事業承継に伴う提供。</li>
            <li>運営上必要な範囲で、クラウドホスティング、解析、決済、メール配信等を外部事業者に委託することがあります。この場合、委託先を適切に選定・監督します。</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. 海外移転</h2>
          <p className="text-gray-700">クラウド等の利用により、取得した情報を日本国外で保管・処理する場合があります。この場合、適用法令に従い、必要な保護措置を講じます。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. 保管期間</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>取得した情報は、利用目的の達成に必要な範囲で保存します。</li>
            <li>アカウント削除後は、法令上の保存義務や紛争対応に必要な範囲を除き、合理的期間内に削除・匿名化します。</li>
            <li>ログ・バックアップについては技術的制約により一定期間保持される場合があります。</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. 安全管理措置</h2>
          <p className="text-gray-700">アクセス制御、暗号化、監査ログ、最小権限、脆弱性対策等、合理的な安全管理措置を講じます。ただし、完全な安全を保証するものではありません。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. ユーザーの権利</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>当サークルが保有する自己の個人情報について、開示・訂正・追加・削除・利用停止・第三者提供停止等を求めることができます。</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. 未成年の利用</h2>
          <p className="text-gray-700">未成年のユーザーは、親権者等の同意を得た上で本サービスを利用してください。13歳未満の方の利用可否について特則がある場合は別途定めます。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">15. 外部リンク</h2>
          <p className="text-gray-700">本サービスからリンクされる外部サイト・アプリのプライバシー実務について、当サークルは責任を負いません。各事業者のポリシーをご確認ください。</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">16. ポリシーの変更</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>法令改正やサービス変更等に応じて予告なく変更することがあります。</li>
            <li>重要な変更を行う場合は、本サービス上での掲示等により周知します。変更後の本サービスの利用は、変更内容への同意を意味します。</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">17. 事業者情報・お問い合わせ窓口</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>事業者名：M.A</li>
            <li>連絡先：matzglobe24@gmail.com</li>
          </ul>
        </section>
      </article>
    </div>
  )
}