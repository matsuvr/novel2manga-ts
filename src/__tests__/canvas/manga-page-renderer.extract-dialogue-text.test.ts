import { describe, expect, it } from 'vitest'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'

describe('extractDialogueText', () => {
  it('話者とカギ括弧を正しく除去する', () => {
    const renderer = new MangaPageRenderer()

    // テストケース1: 話者付きカギ括弧
    expect((renderer as any)['extractDialogueText']('太郎：「こんにちは」')).toBe('こんにちは')

    // テストケース2: 話者付き二重カギ括弧
    expect((renderer as any)['extractDialogueText']('花子：『さようなら』')).toBe('さようなら')

    // テストケース3: カギ括弧のみ
    expect((renderer as any)['extractDialogueText']('「おはよう」')).toBe('おはよう')

    // テストケース4: 文中にカギ括弧を含む
    expect((renderer as any)['extractDialogueText']('太郎：「彼は「いいね」と言った」')).toBe(
      '彼は「いいね」と言った',
    )

    // テストケース5: 半角コロン
    expect((renderer as any)['extractDialogueText']('John:「Hello」')).toBe('Hello')

    // テストケース6: カギ括弧なし
    expect((renderer as any)['extractDialogueText']('太郎：こんにちは')).toBe('こんにちは')

    // テストケース7: 既にクリーンなテキスト
    expect((renderer as any)['extractDialogueText']('こんにちは')).toBe('こんにちは')
  })
})
