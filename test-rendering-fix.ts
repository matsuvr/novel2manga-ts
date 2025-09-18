import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';
import { CanvasRenderer } from './src/lib/canvas/canvas-renderer.js';
import { PanelLayoutCoordinator } from './src/lib/canvas/panel-layout-coordinator.js';

// テスト用のパネルデータ
const testPanel = {
  id: 1,
  position: { x: 0.1, y: 0.1 },
  size: { width: 0.8, height: 0.8 },
  content: 'テストコンテンツ',
  dialogues: [
    {
      speaker: 'テスト',
      text: 'これはテストのテキストです。パネル内に収まるべきです。',
      type: 'speech' as const
    }
  ],
  sfx: [],
  sourceChunkIndex: 0,
  importance: 5
};

async function testRendering() {
  console.log('レンダリングテストを開始します...');

  // Canvas作成
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  // CanvasRendererのインスタンス作成
  // create renderer with required canvas config
  const renderer = new CanvasRenderer({ width: 800, height: 600 });

  // PanelLayoutCoordinatorのインスタンス作成
  const coordinator = new PanelLayoutCoordinator();

  try {
  // パネルの描画テスト
  console.log('パネルの描画をテストします...');
  // draw into renderer's internal canvas
  renderer.drawPanel(testPanel);

  // 結果をファイルに保存（renderer が所有するキャンバスを使う）
  // Node 環境のキャンバスは toBuffer を持つ
  // Access renderer's internal canvas (Node canvas). Use unknown cast to avoid any.
  const nodeCanvas = (renderer as unknown as { canvas: { toBuffer?: (mime?: string) => Buffer } }).canvas
  const buffer = nodeCanvas && typeof nodeCanvas.toBuffer === 'function' ? nodeCanvas.toBuffer('image/png') : canvas.toBuffer('image/png')
  fs.writeFileSync('/tmp/test-panel.png', buffer);
  console.log('テスト結果を /tmp/test-panel.png に保存しました');

    // テキスト配置のテスト
    console.log('テキスト配置をテストします...');
    // calculateContentTextPlacement を使って公開 API 経由で配置を試す
    const panelX = testPanel.position.x * 800
    const panelY = testPanel.position.y * 600
    const panelW = testPanel.size.width * 800
    const panelH = testPanel.size.height * 600
    const panelBounds = { x: panelX, y: panelY, width: panelW, height: panelH }

    const placement = coordinator.calculateContentTextPlacement(
      testPanel.content,
      panelBounds,
      ctx,
      {
        minFontSize: 8,
        maxFontSize: 24,
        padding: 6,
        lineHeight: 1.2,
        maxWidthRatio: 0.8,
        maxHeightRatio: 0.3,
        minAreaSize: 80,
      },
    )
    console.log('テキスト配置結果:', placement);

    console.log('テスト完了！');

  } catch (error) {
    console.error('テスト中にエラーが発生しました:', error);
  }
}

testRendering();