# Requirements Document

## Introduction
YouTube動画のURLを入力するだけで、動画の内容を自動的に要約してくれるWebアプリケーションです。Google Gemini APIの動画理解機能を活用し、長時間の動画でも短時間で内容を把握できるようにすることで、ユーザーの時間を節約し、効率的な情報収集を支援します。

## Requirements

### Requirement 1: 動画URL入力機能
**User Story:** ユーザーとして、YouTube動画のURLを入力できるようにしたい。これにより、要約したい動画を簡単に指定できる。

#### Acceptance Criteria

1. WHEN ユーザーが有効なYouTube動画URLを入力 THEN システムは URLを受け付けて処理を開始する
2. WHEN ユーザーが無効なURLを入力 THEN システムは エラーメッセージを表示し、有効なYouTube URLの入力を促す
3. IF 入力されたURLがYouTube以外のドメイン THEN システムは YouTube動画のURLを入力するよう警告を表示する
4. WHEN ユーザーがURL入力フィールドをクリア THEN システムは 入力フィールドを空の状態にリセットする
5. WHERE URLが短縮形式（youtu.be）の場合 THE SYSTEM SHALL 標準形式に変換して処理を行う

### Requirement 2: 動画内容解析機能
**User Story:** ユーザーとして、入力したYouTube動画の内容を自動的に解析してもらいたい。これにより、動画を視聴せずに内容を理解できる。

#### Acceptance Criteria

1. WHEN 有効なYouTube URLが入力された THEN システムは Gemini APIを使用して動画の解析を開始する
2. WHILE 動画を解析中 THE SYSTEM SHALL 進捗状況をユーザーに表示する
3. IF 動画が非公開または削除されている THEN システムは 適切なエラーメッセージを表示する
4. WHEN 動画の長さが制限を超える場合 THEN システムは 処理可能な最大時間を通知し、ユーザーの確認を求める
5. IF Gemini APIのクォータ制限に達した THEN システムは 一時的に利用できない旨を通知する

### Requirement 3: 要約生成機能
**User Story:** ユーザーとして、動画の内容を分かりやすい日本語の要約として受け取りたい。これにより、短時間で動画の要点を理解できる。

#### Acceptance Criteria

1. WHEN 動画の解析が完了した THEN システムは 日本語で動画内容の要約を生成する
2. WHERE 要約の長さについて THE SYSTEM SHALL デフォルトで200-500文字程度の要約を生成する
3. IF ユーザーが詳細な要約を希望する THEN システムは より長い詳細版の要約も提供する
4. WHEN 要約が生成された THEN システムは 主要なトピック、キーポイント、結論を明確に区別して表示する
5. WHILE 要約を表示中 THE SYSTEM SHALL コピー機能を提供し、ユーザーが要約を簡単に保存できるようにする

### Requirement 4: エラーハンドリング機能
**User Story:** ユーザーとして、エラーが発生した場合に適切なフィードバックを受け取りたい。これにより、問題を理解し、適切に対処できる。

#### Acceptance Criteria

1. WHEN ネットワークエラーが発生した THEN システムは 接続エラーを表示し、再試行ボタンを提供する
2. IF Gemini APIがエラーを返した THEN システムは エラーの内容をユーザーにわかりやすく説明する
3. WHEN 処理がタイムアウトした THEN システムは タイムアウトメッセージを表示し、より短い動画の使用を提案する
4. WHERE エラーが発生した場所に関わらず THE SYSTEM SHALL エラーログを記録し、デバッグ用の情報を保持する
5. IF 連続してエラーが発生した THEN システムは サービスの一時的な問題の可能性を通知する

### Requirement 5: ユーザーインターフェース要件
**User Story:** ユーザーとして、直感的で使いやすいインターフェースを使いたい。これにより、技術的な知識がなくても簡単に利用できる。

#### Acceptance Criteria

1. WHEN ページが読み込まれた THEN システムは URLを入力するための明確なフィールドを表示する
2. WHILE 処理中 THE SYSTEM SHALL ローディングインジケーターを表示し、ユーザーに待機を促す
3. WHEN 要約が表示される THEN システムは 読みやすいフォーマットと適切なフォントサイズで表示する
4. IF モバイルデバイスからアクセスした THEN システムは レスポンシブデザインで適切に表示する
5. WHERE ユーザーが操作する全ての場所で THE SYSTEM SHALL 明確なボタンラベルとヘルプテキストを提供する

### Requirement 6: パフォーマンス要件
**User Story:** ユーザーとして、迅速なレスポンスで要約を取得したい。これにより、効率的に複数の動画の内容を確認できる。

#### Acceptance Criteria

1. WHEN 短い動画（10分未満）を処理する THEN システムは 30秒以内に要約を生成する
2. WHEN 中程度の動画（10-30分）を処理する THEN システムは 60秒以内に要約を生成する
3. IF 処理に予想以上の時間がかかる THEN システムは 推定完了時間を表示する
4. WHERE 同じ動画が再度リクエストされた場合 THE SYSTEM SHALL キャッシュから結果を返し、即座に表示する
5. WHILE 複数のユーザーが同時にアクセスしても THE SYSTEM SHALL 安定したパフォーマンスを維持する