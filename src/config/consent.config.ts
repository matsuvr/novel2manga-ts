// Centralized consent modal configuration (texts & future flags)
// Adding a new consent action requires updating CONSENT_ACTIONS in types/consent.ts
// and appending an entry here.

import type { ConsentAction } from '@/types/consent'

interface ConsentTextItem {
  title: string
  description: string
  bullets: string[]
}

export const consentConfig: Record<ConsentAction, ConsentTextItem> = {
  EXPAND: {
    title: '短い入力の拡張について',
    description:
      '入力されたテキストが短いため、このままでは十分なマンガ用脚本に展開できません。AI が不足するシーンや会話を補完し、元の意図を尊重しつつシナリオを拡張します。AI による創作的補完を許可しますか？',
    bullets: [
      '原意や雰囲気を尊重しつつ背景・登場人物・会話を補います',
      '補完された内容は AI による創作であり元テキストと異なる要素が追加されます',
    ],
  },
  EXPLAINER: {
    title: '論述テキストの教育マンガ化について',
    description:
      '入力されたテキストは物語ではなく説明的・論述的な内容と判定されました。教育マンガ形式（先生役と生徒役の対話など）でわかりやすく再構成します。そうした再構成（創作的脚色）を許可しますか？',
    bullets: [
      '説明文を教師と生徒などのキャラクタ対話へ再構成します',
      '理解促進のための比喩・簡略化が入る場合があります',
    ],
  },
}

export function getConsentTexts(action: ConsentAction) {
  return consentConfig[action]
}
