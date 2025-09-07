"""HTMLベース日本語縦書きAPI - Playwrightで高品質な縦書きレンダリング"""

import asyncio
import base64
import html
import io
import logging
import logging.handlers
import math
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import budoux
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from PIL import Image
from pydantic import BaseModel, Field, validator
from starlette.exceptions import HTTPException as StarletteHTTPException


# ログ設定（エラーのみ記録、1日でローテーション）
def setup_error_only_logging():
    """エラーのみを記録し1日でローテーションするログを設定"""
    # ルートロガーを取得
    root_logger = logging.getLogger()

    # ログファイルパス
    log_file = "logs/api_errors.log"

    # ログディレクトリを作成（存在しない場合）
    import os

    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    # ERRORレベル以上のみをファイルに記録するハンドラを設定
    # ただし権限などで失敗した場合はstderrへのStreamHandlerへフォールバック
    try:
        handler = logging.handlers.TimedRotatingFileHandler(
            filename=log_file,
            when="midnight",  # 毎日真夜中にローテーション
            interval=1,  # 1日間隔
            backupCount=1,  # 1日分のバックアップのみ保持（古いファイルは削除）
            encoding="utf-8",
        )
        handler.setLevel(logging.ERROR)  # ハンドラレベルでERRORに制限
    except Exception:
        # テスト環境等でファイルへ書けない場合
        handler = logging.StreamHandler()
        handler.setLevel(logging.ERROR)

    # ログフォーマット設定
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    handler.setFormatter(formatter)

    # ルートロガーにハンドラを追加
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.DEBUG)  # ロガー自体は全レベル受け付け、ハンドラで制限

    # このモジュール用のロガーも取得して返す
    logger = logging.getLogger(__name__)
    return logger


logger = setup_error_only_logging()

app = FastAPI(title="HTMLベース日本語縦書きAPI")

# セキュリティ設定 (Authorization欠如も401に統一するため auto_error=False)
security = HTTPBearer(auto_error=False)

# 環境変数からトークンを取得 (デフォルト値を設定)
API_TOKEN = os.getenv("API_TOKEN", "your-secret-token-here")

# 同時実行数の制限（高負荷時のメモリピーク抑制）
MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "2"))
_convert_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
# バッチ処理の最大アイテム数（環境変数で上書き可能）
MAX_BATCH_ITEMS = int(os.getenv("MAX_BATCH_ITEMS", "50"))

# フォント関連の定義
DEFAULT_FONT_PATH = Path("fonts/GenEiAntiqueNv5-M.ttf")
FONT_MAP = {
    "gothic": Path("fonts/GenEiMGothic2-Regular.ttf"),
    "mincho": Path("fonts/GenEiChikugoMin3-R.ttf"),
}
FONT_CANDIDATES = [
    DEFAULT_FONT_PATH,
    Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
    Path("/System/Library/Fonts/Hiragino Sans GB.ttc"),  # macOS
    Path("C:/Windows/Fonts/msgothic.ttc"),  # Windows
]

# Base64埋め込みフォントの最大許容サイズ（環境変数で上書き可能）
MAX_FONT_BASE64_SIZE = int(os.getenv("MAX_FONT_BASE64_SIZE", "40000000"))


# ---------- Persistent Playwright browser and page pool ----------
class PagePool:
    def __init__(self, browser, capacity: int = 2):
        self.browser = browser
        self.capacity = max(1, capacity)
        self._queue: asyncio.Queue = asyncio.Queue()
        self._created = 0
        self._lock = asyncio.Lock()

    async def _create_page(self):
        page = await self.browser.new_page(viewport={"width": 10, "height": 10})
        page.set_default_navigation_timeout(30_000)
        return page

    async def precreate(self):
        """容量までページを事前作成し、キューに投入してウォーム状態にする"""
        async with self._lock:
            to_create = max(0, self.capacity - self._created)
            for _ in range(to_create):
                try:
                    page = await self._create_page()
                    await self._queue.put(page)
                    self._created += 1
                except Exception:
                    # 1つでも失敗してもサービスは続行
                    logger.warning("Failed to precreate playwright page", exc_info=True)

    async def acquire(self):
        try:
            page = self._queue.get_nowait()
            return page
        except asyncio.QueueEmpty:
            pass
        async with self._lock:
            if self._created < self.capacity:
                self._created += 1
                return await self._create_page()
        page = await self._queue.get()
        return page

    async def release(self, page):
        try:
            await page.goto("about:blank")
        except Exception:
            try:
                new_page = await self._create_page()
                await self._queue.put(new_page)
                return
            except Exception:
                pass
        await self._queue.put(page)


class BrowserManager:
    _playwright = None
    _browser = None
    _pool: Optional[PagePool] = None
    _init_lock = asyncio.Lock()

    @classmethod
    async def start(cls, pool_size: int):
        if cls._browser is not None and cls._pool is not None:
            return
        async with cls._init_lock:
            if cls._browser is None:
                from playwright.async_api import async_playwright

                cls._playwright = await async_playwright().start()
                cls._browser = await cls._playwright.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                    ],
                )
            if cls._pool is None:
                cls._pool = PagePool(cls._browser, capacity=max(1, pool_size))
                # ページの事前作成（高スループット向け）
                try:
                    precreate = os.getenv("PRECREATE_PAGES", "1") not in (
                        "0",
                        "false",
                        "False",
                    )
                    if precreate:
                        await cls._pool.precreate()
                except Exception:
                    logger.warning("Page precreation at startup failed", exc_info=True)

    @classmethod
    async def get_pool(cls) -> PagePool:
        if cls._pool is None:
            pool_size = int(os.getenv("PAGE_POOL_SIZE", str(MAX_CONCURRENCY)))
            await cls.start(pool_size)
        return cls._pool  # type: ignore

    @classmethod
    async def shutdown(cls):
        try:
            if cls._pool is not None:
                while not cls._pool._queue.empty():
                    page = await cls._pool._queue.get()
                    try:
                        await page.close()
                    except Exception:
                        pass
                cls._pool = None
        finally:
            try:
                if cls._browser is not None:
                    await cls._browser.close()
            finally:
                cls._browser = None
                if cls._playwright is not None:
                    try:
                        await cls._playwright.stop()
                    finally:
                        cls._playwright = None


def select_font_path(font_name: Optional[str]) -> Optional[str]:
    """フォント名からフォントパスを解決。無効な指定はアンチックにフォールバック"""
    if font_name:
        path = FONT_MAP.get(font_name.lower())
        if path and path.exists():
            return str(path)
        logger.error(f"Invalid font specified: {font_name}, using default font")

    if DEFAULT_FONT_PATH.exists():
        return str(DEFAULT_FONT_PATH)
    logger.error(f"Default font not found at {DEFAULT_FONT_PATH}")
    return None


def resolve_font_name_and_path(
    requested_font: Optional[str],
) -> Tuple[str, Optional[str]]:
    """要求フォント名から、実際に使用する論理名とパスを返す。

    戻り値のフォント名は 'gothic' | 'mincho' | 'antique' のいずれか。
    パスは存在確認済みのもの、見つからない場合は None（システムフォントに委ねる）。
    """
    if requested_font:
        key = requested_font.lower()
        path = FONT_MAP.get(key)
        if path and path.exists():
            return key, str(path)
        # 無効指定はアンチックへフォールバック
        logger.error(
            f"Invalid font specified: {requested_font}, falling back to antique",
        )

    # デフォルト（アンチック）
    if DEFAULT_FONT_PATH.exists():
        return "antique", str(DEFAULT_FONT_PATH)
    # デフォルトフォントが見つからない場合でも、論理名は 'antique' を返す
    logger.error(f"Default font not found at {DEFAULT_FONT_PATH}")
    return "antique", None


class ErrorResponse(BaseModel):
    """統一エラーレスポンス"""

    code: str = Field(..., description="アプリケーションエラーコード")
    message: str = Field(..., description="エラーメッセージ（汎用）")
    correlation_id: str = Field(..., alias="correlationId", description="相関ID")
    errors: Optional[list] = Field(default=None, description="詳細エラー（任意）")


def _get_correlation_id(request: Request) -> str:
    """ヘッダから相関IDを取得。無ければ生成。"""
    return (
        request.headers.get("X-Correlation-ID")
        or request.headers.get("X-Correlation-Id")
        or uuid.uuid4().hex
    )


def _error_json_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    errors: Optional[list] = None,
    extra_headers: Optional[dict] = None,
):
    """統一形式のエラーレスポンスを返す（X-Correlation-ID付き）。"""
    cid = _get_correlation_id(request)
    body = ErrorResponse(code=code, message=message, correlationId=cid, errors=errors)
    headers = {"X-Correlation-ID": cid}
    if extra_headers:
        headers.update(extra_headers)
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(by_alias=True),
        headers=headers,
    )


def verify_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    """Bearerトークンの検証（欠如/不一致ともに401へ統一）"""
    if not credentials or not credentials.credentials:
        # 認証情報欠如 → 401
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if credentials.credentials != API_TOKEN:
        # トークン不一致 → 401
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """バリデーションエラー → 422（統一スキーマ）"""
    cid = _get_correlation_id(request)
    try:
        body = await request.body()
    except Exception:
        body = b""
    logger.error(
        f"[VALIDATION_ERROR] Validation failed | "
        f"CID: {cid} | "
        f"Path: {request.url!s} | "
        f"Errors: {exc.errors()!s} | "
        f"Body: {body.decode('utf-8', errors='ignore')}",
    )
    headers = {"X-Correlation-ID": cid}

    # JSON直列化可能な形式にエラーを変換
    safe_errors = []
    for error in exc.errors():
        safe_error = {}
        # 基本的なフィールドのみコピー
        safe_error["type"] = error.get("type", "")
        safe_error["loc"] = error.get("loc", [])
        safe_error["msg"] = error.get("msg", "")
        safe_error["input"] = error.get("input", "")
        # ctxからerrorを除外して安全な形式に変換
        if "ctx" in error:
            ctx = error["ctx"].copy()
            if "error" in ctx:
                ctx["error_str"] = str(ctx["error"])
                del ctx["error"]
            safe_error["ctx"] = ctx
        safe_errors.append(safe_error)

    # 手動でJSONレスポンスを構築
    response_content = {
        "code": "VALIDATION_ERROR",
        "message": "Validation failed",
        "correlationId": cid,
        "errors": safe_errors,
    }

    return JSONResponse(
        status_code=422,
        content=response_content,
        headers=headers,
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """HTTP例外 → 統一スキーマに変換"""
    cid = _get_correlation_id(request)
    status = exc.status_code
    # よく使うコードの標準化
    code_map = {
        401: ("UNAUTHORIZED", "Unauthorized"),
        403: ("FORBIDDEN", "Forbidden"),
        404: ("NOT_FOUND", "Not Found"),
        405: ("METHOD_NOT_ALLOWED", "Method Not Allowed"),
        500: ("INTERNAL_ERROR", "Internal server error"),
    }
    code, message = code_map.get(status, ("HTTP_ERROR", "HTTP error"))

    # ログ(詳細はログにのみ)
    logger.error(
        f"[{code}] {message} | "
        f"CID: {cid} | "
        f"Path: {request.url!s} | "
        f"Status: {status} | "
        f"Detail: {exc.detail!s}",
    )

    headers = {"X-Correlation-ID": cid}
    # 401はWWW-Authenticateヘッダを付与
    if status == 401:
        headers["WWW-Authenticate"] = "Bearer"
    # 既存ヘッダをマージ
    if exc.headers:
        headers.update(exc.headers)

    payload = ErrorResponse(code=code, message=message, correlationId=cid)
    return JSONResponse(
        status_code=status,
        content=payload.model_dump(by_alias=True),
        headers=headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """想定外の例外 → 500 統一スキーマ"""
    cid = _get_correlation_id(request)
    logger.error(
        f"[INTERNAL_ERROR] Unhandled exception | CID: {cid} | Path: {request.url!s}",
        exc_info=True,
    )
    payload = ErrorResponse(
        code="INTERNAL_ERROR",
        message="Internal server error",
        correlationId=cid,
    )
    return JSONResponse(
        status_code=500,
        content=payload.model_dump(by_alias=True),
        headers={"X-Correlation-ID": cid},
    )


# リクエストモデル
class VerticalTextRequest(BaseModel):
    text: str = Field(..., description="レンダリングするテキスト")
    # 無効なフォント指定も受け入れ、処理側でアンチックにフォールバックする
    font: Optional[str] = Field(
        default=None,
        description="使用するフォント（'gothic' または 'mincho'。未指定/無効時はアンチック）",
    )
    font_size: int = Field(default=20, ge=8, le=100, description="フォントサイズ")
    line_height: float = Field(default=1.6, ge=1.0, le=3.0, description="行間")
    letter_spacing: float = Field(
        default=0.05,
        ge=0,
        le=0.5,
        description="文字間（em単位）",
    )
    padding: int = Field(default=20, ge=0, le=100, description="余白（ピクセル）")
    use_tategaki_js: bool = Field(
        default=False,
        description="Tategaki.jsライブラリを使用",
    )
    max_chars_per_line: Optional[int] = Field(
        default=None,
        ge=1,
        le=100,
        description="1行あたりの最大文字数（BudouXで自動改行）",
    )

    @validator("text")
    def text_not_empty(cls, v):
        if not v.strip():
            raise ValueError("テキストが空です")
        return v


# レスポンスモデル
class VerticalTextResponse(BaseModel):
    image_base64: str = Field(..., description="Base64エンコードされた画像")
    width: int = Field(..., description="画像の幅")
    height: int = Field(..., description="画像の高さ")
    processing_time_ms: float = Field(..., description="処理時間（ミリ秒）")
    trimmed: bool = Field(..., description="画像がトリミングされたかどうか")
    font: str = Field(
        ...,
        description="使用されたフォント名（'antique'/'gothic'/'mincho'）",
    )


class _BatchRenderBase(BaseModel):
    font: Optional[str] = Field(default=None, description="使用するフォント")
    font_size: int = Field(default=20, ge=8, le=100, description="フォントサイズ")
    line_height: float = Field(default=1.6, ge=1.0, le=3.0, description="行間")
    letter_spacing: float = Field(
        default=0.05,
        ge=0,
        le=0.5,
        description="文字間（em単位）",
    )
    padding: int = Field(default=20, ge=0, le=100, description="余白（ピクセル）")
    use_tategaki_js: bool = Field(
        default=False,
        description="Tategaki.jsライブラリを使用",
    )
    max_chars_per_line: Optional[int] = Field(
        default=None,
        ge=1,
        le=100,
        description="1行あたりの最大文字数（BudouXで自動改行）",
    )


class BatchRenderItem(_BatchRenderBase):
    text: str = Field(..., description="レンダリングするテキスト")

    @validator("text")
    def text_not_empty(cls, v):
        if not v.strip():
            raise ValueError("テキストが空です")
        return v


class BatchRenderDefaults(_BatchRenderBase):
    pass


class BatchRenderRequest(BaseModel):
    defaults: Optional[BatchRenderDefaults] = None
    items: List[BatchRenderItem] = Field(..., min_length=1)


class BatchRenderError(BaseModel):
    code: str
    message: str


class BatchRenderItemResult(BaseModel):
    image_base64: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    processing_time_ms: Optional[float] = None
    trimmed: Optional[bool] = None
    font: Optional[str] = None
    error: Optional[BatchRenderError] = None


class BatchRenderResponse(BaseModel):
    results: List[BatchRenderItemResult]


class JapaneseVerticalHTMLGenerator:
    """HTMLとCSSで日本語縦書きを生成するクラス"""

    def __init__(self, font_path: Optional[str] = None):
        self.font_path = font_path or self._get_default_font_path()
        # BudouXパーサーの初期化
        self.budoux_parser = budoux.load_default_japanese_parser()
        self._font_base64_cache: Dict[str, str] = {}
        # 高負荷運用向け: 起動時にフォントをメモリへ先読み（環境変数で制御可能）
        try:
            preload = os.getenv("PRELOAD_FONTS", "1") not in ("0", "false", "False")
            if preload:
                self._preload_fonts_into_memory()
            # フォント用に一定量のメモリを確保（要求があれば）
            self._ensure_font_memory_reserve()
        except Exception:
            # 先読み失敗は致命的ではないため握りつぶして続行
            logger.warning(
                "Font preload failed; will lazily load on first use",
                exc_info=True,
            )

    def _preload_fonts_into_memory(self) -> None:
        """既知のフォントをBase64へ変換しプロセスのメモリにキャッシュ"""
        candidates: List[Path] = []
        # デフォルトフォントとAPIで選べるフォント群
        candidates.append(DEFAULT_FONT_PATH)
        candidates.extend(FONT_MAP.values())
        # システム候補（存在すれば）
        candidates.extend(FONT_CANDIDATES)
        seen: set[str] = set()
        for p in candidates:
            try:
                if not p:
                    continue
                p_str = str(p)
                if p_str in seen:
                    continue
                seen.add(p_str)
                if Path(p_str).exists():
                    # キャッシュミス時のみ実ファイルから読み込み
                    if self._font_base64_cache.get(p_str) is None:
                        self._encode_font_as_base64(p_str)
            except Exception:
                # ログのみ、処理継続
                logger.warning("Failed to preload font: %s", p, exc_info=True)

    def _ensure_font_memory_reserve(self) -> None:
        """フォント用に所定のメモリを確保しておく（既存キャッシュ不足分をゼロ埋めで確保）。

        環境変数 `FONT_MEMORY_RESERVE_MB`（デフォルト40）で目標確保量を指定。
        実際のフォントBase64キャッシュの合計が不足している場合のみ差分を確保する。
        """
        try:
            target_mb = int(os.getenv("FONT_MEMORY_RESERVE_MB", "40"))
        except ValueError:
            target_mb = 40
        target_bytes = max(0, target_mb * 1024 * 1024)

        total_cache_bytes = 0
        try:
            for v in self._font_base64_cache.values():
                if isinstance(v, str) or isinstance(v, (bytes, bytearray)):
                    total_cache_bytes += len(v)
        except Exception:
            pass

        reserve_needed = max(0, target_bytes - total_cache_bytes)
        try:
            self._font_memory_reserve = (
                bytearray(reserve_needed) if reserve_needed > 0 else b""
            )
            if reserve_needed > 0:
                logger.info(
                    "Reserved additional font memory: %s bytes (cache=%s bytes, target=%s bytes)",
                    reserve_needed,
                    total_cache_bytes,
                    target_bytes,
                )
        except Exception:
            # メモリ確保に失敗してもサービスは継続
            logger.warning("Font memory reserve allocation failed", exc_info=True)

    def _get_default_font_path(self) -> str:
        """デフォルトフォントパスを取得"""
        for path in FONT_CANDIDATES:
            if path.exists():
                return str(path)

        logger.error("No Japanese font found, using system default")
        return ""

    def _apply_budoux_line_breaks(self, text: str, max_chars_per_line: int) -> str:
        """BudouXを使用して適切な位置で改行を入れる"""
        lines = text.split("\n")
        processed_lines = []

        for line in lines:
            if len(line) <= max_chars_per_line:
                # 行が最大文字数以下ならそのまま
                processed_lines.append(line)
            else:
                # BudouXで文節に分割
                chunks = self.budoux_parser.parse(line)

                # 文節を組み合わせて行を作成
                current_line = ""
                current_length = 0

                for chunk in chunks:
                    chunk_length = len(chunk)

                    # チャンクが最大文字数を超える場合、強制的に分割（バルク処理）
                    if chunk_length > max_chars_per_line:
                        if current_line:
                            processed_lines.append(current_line)
                            current_line = ""
                            current_length = 0

                        parts = [
                            chunk[i : i + max_chars_per_line]
                            for i in range(0, chunk_length, max_chars_per_line)
                        ]
                        for part in parts[:-1]:
                            processed_lines.append(part)
                        # 最後のパートは次の処理に回す
                        chunk = parts[-1]
                        chunk_length = len(chunk)

                    if current_length + chunk_length <= max_chars_per_line:
                        # 現在の行に追加
                        current_line += chunk
                        current_length += chunk_length
                    else:
                        # 新しい行を開始
                        if current_line:
                            processed_lines.append(current_line)
                        current_line = chunk
                        current_length = chunk_length

                # 最後の行を追加
                if current_line:
                    processed_lines.append(current_line)

        processed_lines = self._apply_line_head_kinsoku(processed_lines)
        return "\n".join(processed_lines)

    def _apply_line_head_kinsoku(self, lines: List[str]) -> List[str]:
        """指定した記号が行頭に来ないように調整"""
        forbidden = {"、", "。", "」", "〟", "っ", "ッ", "ｯ"}
        adjusted = lines[:]
        for i in range(1, len(adjusted)):
            while adjusted[i] and adjusted[i][0] in forbidden:
                adjusted[i - 1] += adjusted[i][0]
                adjusted[i] = adjusted[i][1:]
        return adjusted

    def _encode_font_as_base64(self, font_path: Optional[str] = None) -> Optional[str]:
        """フォントファイルをBase64エンコード（結果をキャッシュ）"""
        path = font_path or self.font_path
        if not path or not os.path.exists(path):
            return None
        cached = self._font_base64_cache.get(path)
        if cached is not None:
            return cached
        try:
            with open(path, "rb") as f:
                font_data = f.read()
            encoded = base64.b64encode(font_data).decode("utf-8")
            self._font_base64_cache[path] = encoded
            return encoded
        except Exception as e:
            logger.error(
                f"[FONT_ENCODING_ERROR] Failed to encode font: {e!s} | "
                f"Error type: {type(e).__name__} | "
                f"Font path: {path}",
                exc_info=True,
            )
            return None

    def _escape_html(self, text: str) -> str:
        """HTMLエスケープ処理"""
        return html.escape(text, quote=True)

    def _process_text_for_vertical(self, text: str) -> str:
        """縦書き用のテキスト処理（縦中横など）"""
        # 改行を<br>に変換
        text = self._escape_html(text)
        lines = text.split("\n")

        processed_lines = []
        for line in lines:
            # 2桁数字を縦中横にする（3桁以上は除外）
            # 数字の前後が数字でない2桁の数字のみを縦中横にする
            line = re.sub(
                r"(?<!\d)(\d{1,2})(?!\d)",
                r'<span class="tcy">\1</span>',
                line,
            )

            # 三点リーダーを縦書き用の文字に置換（源暎アンチック対応）
            # U+2026（…）をU+FE19（︙）に変換
            line = line.replace("…", "︙")

            # 棒状記号（ダーシ・罫線など）で縦組時に回転定義がないものを水平バーで描画
            # 対象:
            #  – (U+2013 EN DASH)
            #  — (U+2014 EM DASH)
            #  ― (U+2015 HORIZONTAL BAR)
            #  − (U+2212 MINUS SIGN)
            #  － (U+FF0D FULLWIDTH HYPHEN-MINUS)
            #  ─ (U+2500 BOX DRAWINGS LIGHT HORIZONTAL)
            #  ━ (U+2501 BOX DRAWINGS HEAVY HORIZONTAL)
            #  ⎯ (U+23AF HORIZONTAL LINE EXTENSION)
            #  ⸺ (U+2E3A TWO-EM DASH)
            #  ⸻ (U+2E3B THREE-EM DASH)
            # 注意: 長音記号「ー」(U+30FC) は含めない
            rotatable_pattern = r"([–—―−－─━⎯⸺⸻]+)"

            def _dash_to_rotate(m: re.Match) -> str:
                out = []
                for ch in m.group(1):
                    # 縦組み対応していない棒状記号を90度回転
                    out.append(f'<span class="rotate-90">{ch}</span>')
                return "".join(out)

            line = re.sub(rotatable_pattern, _dash_to_rotate, line)

            processed_lines.append(line)

        return "<br>".join(processed_lines)

    def _calculate_canvas_size(
        self,
        text: str,
        font_size: int,
        line_height: float,
        padding: int,
        max_chars_per_line: int,
    ) -> Tuple[int, int]:
        """テキストと行長上限からキャンバスサイズを一貫したロジックで推定"""
        lines = text.split("\n")
        total_chars = sum(len(line) for line in lines)
        column_width = int(font_size * line_height * 1.2)

        # 行の最大文字数（縦方向の最大段数）に合わせて高さを見積もり、
        # 総文字数から必要列数を算出する。
        chars_per_column = max(1, int(max_chars_per_line))
        estimated_columns = max(1, int(math.ceil(total_chars / chars_per_column)))

        estimated_height = int(
            (chars_per_column * font_size * line_height) + (padding * 2) + 50,
        )
        estimated_width = (estimated_columns * column_width) + (padding * 2)
        return max(200, estimated_width), max(200, estimated_height)

    def _font_face_css(self, font_base64: Optional[str]) -> str:
        """フォント定義のCSSを生成"""
        if not font_base64:
            return ""
        return f"""
            @font-face {{
                font-family: 'VerticalTextFont';
                src: url(data:font/ttf;base64,{font_base64}) format('truetype');
                font-display: block;
            }}
            """

    def create_vertical_html(
        self,
        text: str,
        font_size: int = 20,
        line_height: float = 1.6,
        letter_spacing: float = 0.05,
        padding: int = 20,
        use_tategaki_js: bool = False,
        max_chars_per_line: Optional[int] = None,
        font_path: Optional[str] = None,
    ) -> str:
        """縦書きHTMLを生成"""
        # 最大文字数が未指定なら、総文字数の平方根に最も近い自然数を採用（以後の計算でも再利用）
        effective_max_chars = max_chars_per_line
        if effective_max_chars is None:
            total_chars_no_nl = len(text.replace("\n", ""))
            effective_max_chars = max(1, round(math.sqrt(total_chars_no_nl)))

        # BudouXによる自動改行処理（1回で十分）
        text = self._apply_budoux_line_breaks(text, effective_max_chars)

        # フォントを常にBase64でエンコードして埋め込む
        font_base64: Optional[str] = self._encode_font_as_base64(font_path)
        # 以前は3MB以上を回避していたが、ローカルフォント（源暎系）を確実に使うため閾値を引き上げ
        # （Base64化で ~1.3x になるため、40MB まで許容）
        if font_base64 and len(font_base64) > MAX_FONT_BASE64_SIZE:
            logger.error(
                "[FONT_EMBED_SKIPPED] Embedded font too large; falling back to system fonts | size(base64): %s bytes (limit=%s)",
                len(font_base64),
                MAX_FONT_BASE64_SIZE,
            )
            font_base64 = None

        # テキスト処理
        processed_text = self._process_text_for_vertical(text)

        # テキストの文字数を基に適切なサイズを一元ロジックで計算
        estimated_width, estimated_height = self._calculate_canvas_size(
            text=text,
            font_size=font_size,
            line_height=line_height,
            padding=padding,
            max_chars_per_line=effective_max_chars,
        )

        # フォントフェイス定義（埋め込み有効時のみ）
        font_face = self._font_face_css(font_base64)

        # Tategaki.jsの追加
        tategaki_imports = ""
        tategaki_script = ""
        if use_tategaki_js:
            tategaki_imports = """
            <link rel="stylesheet" href="https://unpkg.com/tategaki/assets/tategaki.css">
            <script src="https://unpkg.com/tategaki/dist/tategaki.min.js"></script>
            """
            tategaki_script = """
            <script>
                // Tategaki.jsの初期化
                document.addEventListener('DOMContentLoaded', function() {
                    new Tategaki('.vertical-text-content');
                });
            </script>
            """

        # HTML生成
        html_content = f"""
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    {tategaki_imports}
    <style>
        {font_face}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            /* 予測値は下限として扱い、コンテンツが増えたら自動で拡張 */
            min-width: {estimated_width}px;
            min-height: {estimated_height}px;
            background: transparent;
            /* コンテンツが推定を超える場合に切れないようにする */
            overflow: visible;
        }}

        .vertical-text-container {{
            /* コンテンツに合わせてサイズが決まるようにする */
            display: inline-block;
            width: auto;
            height: auto;
            padding: {padding}px;
            background: transparent;
        }}

        .vertical-text-content {{
            writing-mode: vertical-rl;
            text-orientation: mixed;
            font-family: 'VerticalTextFont', 'Noto Sans CJK JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif;
            font-size: {font_size}px;
            line-height: {line_height};
            letter-spacing: {letter_spacing}em;
            /* コンテンツの自然な大きさを尊重 */
            display: inline-block;
            width: auto;
            /* 折返し（列生成）を促すために高さを固定 */
            height: {estimated_height}px;
            color: #000;
            overflow: visible;
            word-break: normal;
            text-align: start;
            /* 空白と改行を保持し、自動折り返しを無効化 */
            white-space: pre;
        }}

        /* 縦中横（tate-chu-yoko） */
        .tcy {{
            text-combine-upright: all;
            -webkit-text-combine: horizontal;
            -ms-text-combine-horizontal: all;
            text-orientation: upright;
            display: inline-block;
            vertical-align: middle;
            margin-top: -0.1em;
        }}

        /* 縦組で回転が定義されていない棒状記号を強制回転 */
        .rotate-90 {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1em;
            height: 1em;
            /* 内側は横書きとして扱い、確実に90度回転させる */
            writing-mode: horizontal-tb;
            text-orientation: mixed;
            /* フォントの縦字機能は無効化して形のブレを避ける */
            font-feature-settings: 'vert' 0, 'vrt2' 0, 'vpal' 0;
            transform: rotate(90deg);
            transform-origin: center center;
            line-height: 1;
            letter-spacing: 0;
            white-space: nowrap;
            vertical-align: baseline;
            /* 位置調整用の追加プロパティ */
            position: relative;
            top: 0.1em;  /* 微調整値（フォントにより調整が必要な場合がある） */
        }}

        /* 水平バー（横線）スタイル */
        .hbar {{
            display: inline-block;
            width: 1em;
            height: 2px;
            background-color: currentColor;
            vertical-align: middle;
            margin: 0.2em 0;
        }}

        .hbar--bold {{
            height: 3px;
        }}

        /* ブラウザのデフォルトスタイルを確実にリセット */
        br {{
            margin: 0;
            padding: 0;
            line-height: inherit;
        }}

        /* ルビ対応 */
        ruby {{
            ruby-position: inter-character;
        }}

        rt {{
            font-size: 0.5em;
        }}
    </style>
</head>
<body>
    <div class="vertical-text-container">
        <div class="vertical-text-content">{processed_text}</div>
    </div>
    {tategaki_script}
</body>
</html>
        """

        return html_content


class HTMLToPNGConverter:
    """HTMLからPNGへの変換クラス（Playwright使用）"""

    @staticmethod
    async def _render_on_page(page, html_content: str) -> Tuple[bytes, int, int]:
        await page.set_content(html_content, wait_until="domcontentloaded")
        await page.wait_for_function("() => document.fonts.ready")
        await page.evaluate(
            """
            () => {
                document.body.style.backgroundColor = 'transparent';
                document.documentElement.style.backgroundColor = 'transparent';
                const elements = document.querySelectorAll('*');
                elements.forEach(el => {
                    const computed = window.getComputedStyle(el);
                    if (computed.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                        computed.backgroundColor !== 'transparent') {
                        el.style.backgroundColor = 'transparent';
                    }
                });
            }
        """,
        )
        dimensions = await page.evaluate(
            """
            () => {
                const container = document.querySelector('.vertical-text-container');
                return {
                    width: Math.ceil(container.scrollWidth),
                    height: Math.ceil(container.scrollHeight)
                };
            }
        """,
        )
        # 任意の上限によってコンテンツが切れないように、実寸を採用
        actual_width = max(
            1,
            int(dimensions["width"]) if dimensions.get("width") else 1,
        )
        actual_height = max(
            1,
            int(dimensions["height"]) if dimensions.get("height") else 1,
        )
        locator = page.locator(".vertical-text-container")
        screenshot_bytes = await locator.screenshot(type="png", omit_background=True)
        return screenshot_bytes, actual_width, actual_height

    async def render_on_page(self, page, html_content: str) -> Tuple[bytes, int, int]:
        """公開用のラッパー。内部のプライベート実装を呼び出す。"""
        return await HTMLToPNGConverter._render_on_page(page, html_content)

    @staticmethod
    async def convert_with_playwright(
        html_content: str,
    ) -> Tuple[float, bytes, int, int]:
        """PlaywrightでHTMLをPNGに変換（常駐ブラウザ＋ページプール使用）"""
        start_time = time.time()

        try:
            # 同時実行を制限しつつ、共有のページプールから取得
            async with _convert_semaphore:
                pool = await BrowserManager.get_pool()
                page = await pool.acquire()
                try:
                    (
                        screenshot_bytes,
                        actual_width,
                        actual_height,
                    ) = await HTMLToPNGConverter._render_on_page(page, html_content)
                finally:
                    await pool.release(page)

        except Exception as e:
            logger.error(
                f"[PLAYWRIGHT_ERROR] Playwright conversion failed: {e!s} | "
                f"Error type: {type(e).__name__} | "
                f"HTML content length: {len(html_content)}",
                exc_info=True,
            )
            raise

        return (
            (time.time() - start_time) * 1000,
            screenshot_bytes,
            actual_width,
            actual_height,
        )


def trim_image(image_bytes: bytes) -> Tuple[Image.Image, bool]:
    """画像の余白をトリミング（文字列をピッタリ囲む）"""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        bbox = img.getbbox()
        if bbox:
            trimmed = img.crop(bbox)
            return trimmed, True
        return img, False
    except Exception as e:
        logger.error(
            f"[TRIM_ERROR] Failed to trim image: {e!s} | "
            f"Error type: {type(e).__name__} | "
            f"Image bytes length: {len(image_bytes)}",
            exc_info=True,
        )
        raise


# サービスクラス


class VerticalTextRendererService:
    """縦書きレンダリング処理を提供するサービス"""

    def __init__(
        self,
        html_gen: JapaneseVerticalHTMLGenerator,
        conv: HTMLToPNGConverter,
    ):
        self._html_gen = html_gen
        self._converter = conv

    async def render(self, request: VerticalTextRequest) -> VerticalTextResponse:
        font_name, font_path = resolve_font_name_and_path(request.font)
        html_content = self._html_gen.create_vertical_html(
            text=request.text,
            font_size=request.font_size,
            line_height=request.line_height,
            letter_spacing=request.letter_spacing,
            padding=request.padding,
            use_tategaki_js=request.use_tategaki_js,
            max_chars_per_line=request.max_chars_per_line,
            font_path=font_path,
        )

        (
            processing_time,
            screenshot_bytes,
            _,
            _,
        ) = await self._converter.convert_with_playwright(html_content)

        img, trimmed = trim_image(screenshot_bytes)
        img_byte_arr = io.BytesIO()
        try:
            img.save(img_byte_arr, format="PNG", optimize=True)
            image_data = img_byte_arr.getvalue()
        finally:
            try:
                img.close()
            except Exception as e:
                logger.warning(
                    "Failed to close image object: %s",
                    e,
                    exc_info=True,
                )
            img_byte_arr.close()

        width, height = img.size
        image_base64 = base64.b64encode(image_data).decode("utf-8")

        return VerticalTextResponse(
            image_base64=image_base64,
            width=width,
            height=height,
            processing_time_ms=processing_time,
            trimmed=trimmed,
            font=font_name,
        )

    async def render_batch(
        self,
        items: List[BatchRenderItem],
    ) -> List[BatchRenderItemResult]:
        results: List[BatchRenderItemResult] = []

        async with _convert_semaphore:
            pool = await BrowserManager.get_pool()

            async def _render_one_item(
                item: BatchRenderItem,
                page,
            ) -> BatchRenderItemResult:
                start_time = time.time()
                try:
                    font_name, font_path = resolve_font_name_and_path(item.font)
                    html_content = self._html_gen.create_vertical_html(
                        text=item.text,
                        font_size=item.font_size,
                        line_height=item.line_height,
                        letter_spacing=item.letter_spacing,
                        padding=item.padding,
                        use_tategaki_js=item.use_tategaki_js,
                        max_chars_per_line=item.max_chars_per_line,
                        font_path=font_path,
                    )
                    (
                        screenshot_bytes,
                        _,
                        _,
                    ) = await self._converter.render_on_page(
                        page,
                        html_content,
                    )
                    img, trimmed = trim_image(screenshot_bytes)
                    img_byte_arr = io.BytesIO()
                    try:
                        img.save(img_byte_arr, format="PNG", optimize=True)
                        image_data = img_byte_arr.getvalue()
                    finally:
                        try:
                            img.close()
                        except Exception as e:
                            logger.warning(
                                "Failed to close image object: %s",
                                e,
                                exc_info=True,
                            )
                        img_byte_arr.close()
                    width, height = img.size
                    image_base64 = base64.b64encode(image_data).decode("utf-8")
                    processing_time = (time.time() - start_time) * 1000
                    return BatchRenderItemResult(
                        image_base64=image_base64,
                        width=width,
                        height=height,
                        processing_time_ms=processing_time,
                        trimmed=trimmed,
                        font=font_name,
                    )
                except Exception as e:
                    logger.error(
                        f"[BATCH_RENDER_ERROR] Rendering failed: {e!s} | "
                        f"Error type: {type(e).__name__} | "
                        f"Text length: {len(item.text)} | Font: {item.font}",
                        exc_info=True,
                    )
                    return BatchRenderItemResult(
                        error=BatchRenderError(
                            code="RENDER_ERROR",
                            message="Rendering failed",
                        ),
                    )

            # ページをプールから取得し、アイテム間で再利用
            page = await pool.acquire()
            try:
                for item in items:
                    result = await _render_one_item(item, page)
                    results.append(result)
            finally:
                await pool.release(page)

        return results


# グローバルインスタンス
html_generator = JapaneseVerticalHTMLGenerator()
converter = HTMLToPNGConverter()
renderer_service = VerticalTextRendererService(html_generator, converter)


# FastAPI lifecycle events to manage persistent browser
@app.on_event("startup")
async def _on_startup():
    # pytest 実行時や明示的にスキップ指定された場合は、ブラウザ初期化/ウォームアップを行わない
    if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("SKIP_BROWSER_INIT") in (
        "1",
        "true",
        "True",
    ):
        return
    try:
        pool_size = int(os.getenv("PAGE_POOL_SIZE", str(MAX_CONCURRENCY)))
    except ValueError:
        pool_size = MAX_CONCURRENCY
    await BrowserManager.start(pool_size)
    # 軽いウォームアップ（任意）
    try:
        do_warmup = os.getenv("WARMUP_RENDER_ON_STARTUP", "1") not in (
            "0",
            "false",
            "False",
        )
        if do_warmup:
            # ごく小さいレンダリングを1回実行してJITやフォント読み込みを温める
            font_name, font_path = resolve_font_name_and_path(None)
            html_content = html_generator.create_vertical_html(
                text="起動確認",
                font_size=16,
                line_height=1.5,
                letter_spacing=0.02,
                padding=8,
                use_tategaki_js=False,
                max_chars_per_line=None,
                font_path=font_path,
            )
            try:
                # 実画像は保持せずに単純にパイプラインを1度通す
                await converter.convert_with_playwright(html_content)
            except Exception:
                logger.warning("Warmup render failed; continuing", exc_info=True)
    except Exception:
        # 起動を妨げない
        logger.warning("Warmup section failed", exc_info=True)


@app.on_event("shutdown")
async def _on_shutdown():
    await BrowserManager.shutdown()


@app.post(
    "/render",
    response_model=VerticalTextResponse,
    dependencies=[Depends(verify_token)],
)
async def render_vertical_text(request: VerticalTextRequest):
    """縦書きテキストをレンダリング（認証必須）"""
    logger.info("Checking POST /render start")
    try:
        result = await renderer_service.render(request)
        logger.info("Checking POST /render end")
        return result
    except Exception as e:
        logger.error(
            f"[RENDER_ERROR] Rendering failed: {e!s} | "
            f"Error type: {type(e).__name__} | "
            f"Request data - text_length: {len(request.text)}, font: {request.font}, "
            f"font_size: {request.font_size}, line_height: {request.line_height}, "
            f"letter_spacing: {request.letter_spacing}, padding: {request.padding}, "
            f"use_tategaki_js: {request.use_tategaki_js}, max_chars_per_line: {request.max_chars_per_line} | "
            f"Resolved font: {resolve_font_name_and_path(request.font)}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post(
    "/render/batch",
    response_model=BatchRenderResponse,
    dependencies=[Depends(verify_token)],
)
async def render_vertical_text_batch(request: BatchRenderRequest):
    """複数テキストをまとめてレンダリング（認証必須）"""
    if len(request.items) > MAX_BATCH_ITEMS:
        raise HTTPException(
            status_code=400,
            detail=f"items length must be {MAX_BATCH_ITEMS} or less",
        )

    defaults = (
        request.defaults.model_dump(exclude_unset=True) if request.defaults else {}
    )
    merged_items: List[BatchRenderItem] = []
    for item in request.items:
        params = {**defaults, **item.model_dump(exclude_unset=True)}
        merged_items.append(BatchRenderItem(**params))

    try:
        results = await renderer_service.render_batch(merged_items)
        return BatchRenderResponse(results=results)
    except Exception as e:
        logger.error(
            f"[BATCH_RENDER_ERROR] Batch rendering failed: {e!s} | Error type: {type(e).__name__}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/")
async def root():
    """APIの基本情報（認証不要）"""
    return {
        "title": "HTMLベース日本語縦書きAPI",
        "version": "6.0.0",
        "description": "HTML/CSSによる安定した日本語縦書きレンダリング",
        "features": {
            "html_css": "writing-mode: vertical-rl, text-orientation: mixed",
            "font": "源暎アンチックフォント対応",
            "auto_sizing": "テキスト量に応じた自動サイズ調整",
            "auto_trim": "文字列をピッタリ囲むトリミング",
            "tategaki_js": "Tategaki.jsライブラリ対応（オプション）",
            "transparent_bg": "透明背景対応",
            "converter": "Playwright (Chrome Headless)",
            "budoux": "BudouXによる自然な改行",
        },
        "endpoints": {
            "/render": "縦書きテキストをレンダリング（要認証）",
            "/render/batch": "複数テキストを一括レンダリング（要認証）",
            "/debug/html": "生成されるHTMLを確認（要認証）",
            "/health": "ヘルスチェック（認証不要）",
        },
        "authentication": "Bearer token required for protected endpoints",
    }


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "html_generator": "JapaneseVerticalHTMLGenerator",
        "version": "6.0.0",
    }


@app.get("/debug/html", dependencies=[Depends(verify_token)])
async def debug_html(
    text: str = "テスト文字列\n縦書きのテストです。",
    font_size: int = 20,
    use_tategaki_js: bool = False,
    max_chars_per_line: Optional[int] = None,
    font: Optional[str] = None,
):
    """生成されるHTMLをデバッグ用に確認（認証必須）"""
    try:
        font_path = select_font_path(font)
        html_content = html_generator.create_vertical_html(
            text=text,
            font_size=font_size,
            use_tategaki_js=use_tategaki_js,
            max_chars_per_line=max_chars_per_line,
            font_path=font_path,
        )
        return HTMLResponse(content=html_content)
    except Exception as e:
        logger.error(
            f"[DEBUG_HTML_ERROR] debug_html failed: {e!s} | "
            f"Error type: {type(e).__name__} | "
            f"Query params - text: {text[:100] + '...' if len(text) > 100 else text}, "
            f"font_size: {font_size}, use_tategaki_js: {use_tategaki_js}, "
            f"max_chars_per_line: {max_chars_per_line}, font: {font} | "
            f"Resolved font: {resolve_font_name_and_path(font)}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Internal server error")


if __name__ == "__main__":
    import uvicorn

    # Cloud RunではPORT環境変数を使用
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
