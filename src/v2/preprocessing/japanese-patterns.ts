export const HONORIFIC_TERMS = ['さん', '様', '君', 'ちゃん', '殿', '先生', '氏', '嬢'] as const
export const TITLE_TERMS = ['隊長', '団長', '部長', '課長', '司令官', '王', '姫', '博士', '隊員', '提督'] as const
export const PRONOUN_TERMS = [
  '彼ら',
  '彼女ら',
  '彼女',
  '彼',
  '我々',
  '私たち',
  '私',
  '俺',
  '僕',
  'あたし',
  'あなた',
  '貴方',
  '君',
  'きみ',
  'お前',
  'あいつ',
] as const

export const PERSON_NAME_PATTERN = /(?:[一-龥々〆ヶ]{2,}(?:\s*[一-龥々〆ヶ]{1,})?|[ァ-ヴー]{3,}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gu
export const HONORIFIC_PATTERN = new RegExp(`(?:${HONORIFIC_TERMS.join('|')})`, 'u')
export const TITLE_PATTERN = new RegExp(`(?:${TITLE_TERMS.join('|')})`, 'u')
export const PRONOUN_PATTERN = new RegExp(`(?:${PRONOUN_TERMS.join('|')})`, 'gu')
export const LOCATION_PATTERN = /(?:[一-龥々〆ヶ]{2,}(?:市|町|村|県|国|城|領)|[A-Z][a-z]+(?:\s+(?:City|Town|Kingdom|Empire))?)/gu

export const CONTEXT_WINDOW = 12
