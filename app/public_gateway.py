"""Public-facing gateway that preserves current web routes and serves Expo web assets under `/app`."""

from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse, Response

from app.config import get_settings

settings = get_settings()
app = FastAPI(
    title=f'{settings.app_name} Public Gateway',
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

PROXY_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
PROXY_EXCLUDE_HEADERS = {
    'connection',
    'content-length',
    'content-type',
    'host',
    'transfer-encoding',
}
EXPO_WEB_PREFIX = '/app'


def _frontend_dist_dir() -> Path:
    """Returns the built Expo web directory the public gateway should serve."""
    return settings.resolved_web_dist_dir


def _safe_relative_path(path: str) -> Path:
    """Normalizes a requested public path into a traversal-safe relative file path."""
    relative = PurePosixPath(path.strip('/'))
    parts = [part for part in relative.parts if part not in ('', '.')]
    if any(part == '..' for part in parts):
        raise HTTPException(status_code=404, detail='Not found.')
    return Path(*parts) if parts else Path()


def _candidate_frontend_files(path: str) -> list[Path]:
    """Builds the list of possible static files for a public route request."""
    dist_dir = _frontend_dist_dir()
    relative = _safe_relative_path(path)
    candidates: list[Path] = []

    if not relative.parts:
        candidates.append(dist_dir / 'index.html')
        return candidates

    direct = dist_dir / relative
    candidates.append(direct)
    if direct.suffix == '':
        candidates.append(direct.with_suffix('.html'))
        candidates.append(direct / 'index.html')
    return candidates


def _resolve_frontend_file(path: str) -> tuple[Path | None, int]:
    """Resolves the exported Expo web file that should satisfy the incoming route."""
    dist_dir = _frontend_dist_dir()
    if not dist_dir.exists():
        return None, 503

    dist_root = dist_dir.resolve()
    for candidate in _candidate_frontend_files(path):
        try:
            resolved = candidate.resolve()
        except FileNotFoundError:
            continue
        if dist_root not in resolved.parents and resolved != dist_root:
            continue
        if resolved.is_file():
            return resolved, 200

    not_found_page = dist_dir / '+not-found.html'
    if not_found_page.exists():
        return not_found_page.resolve(), 404

    return dist_dir / 'index.html', 200


async def _proxy_to_internal_api(request: Request, upstream_path: str) -> Response:
    """Forwards an incoming public route request to the loopback FastAPI API service."""
    body = await request.body()
    target_url = f'{settings.internal_api_base_url}{upstream_path}'
    if request.url.query:
        target_url = f'{target_url}?{request.url.query}'

    headers = {key: value for key, value in request.headers.items() if key.lower() != 'host'}
    headers['X-Forwarded-Host'] = request.headers.get('host', '')
    headers['X-Forwarded-Proto'] = request.url.scheme

    upstream_request = UrlRequest(
        url=target_url,
        data=body or None,
        headers=headers,
        method=request.method,
    )

    try:
        with urlopen(upstream_request, timeout=60) as upstream_response:
            payload = upstream_response.read()
            response_headers = upstream_response.headers
            status_code = upstream_response.status
    except HTTPError as exc:
        payload = exc.read()
        response_headers = exc.headers
        status_code = exc.code
    except URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f'Unable to reach the internal API at {settings.internal_api_base_url}.',
        ) from exc

    filtered_headers = {
        key: value
        for key, value in response_headers.items()
        if key.lower() not in PROXY_EXCLUDE_HEADERS
    }
    media_type = response_headers.get_content_type() if response_headers.get('content-type') else None
    return Response(
        content=payload,
        status_code=status_code,
        headers=filtered_headers,
        media_type=media_type,
    )


@app.get('/healthz')
def gateway_health() -> dict:
    """Reports whether the public gateway can reach both the API target and Expo web bundle path."""
    dist_dir = _frontend_dist_dir()
    return {
        'status': 'ok',
        'expo_web_ready': dist_dir.exists(),
        'expo_web_dir': str(dist_dir),
        'internal_api_base_url': settings.internal_api_base_url,
    }


@app.get(EXPO_WEB_PREFIX)
@app.get(f'{EXPO_WEB_PREFIX}' + '/{path:path}')
def serve_frontend(path: str = '') -> Response:
    """Serves the exported Expo web frontend under the `/app` prefix."""
    file_path, status_code = _resolve_frontend_file(path)
    if file_path is None:
        return PlainTextResponse(
            'Expo web build not found. Run `npm run export:web` inside `client/` before opening `/app`.',
            status_code=status_code,
        )
    return FileResponse(file_path, status_code=status_code)


@app.api_route('/', methods=PROXY_METHODS)
@app.api_route('/{path:path}', methods=PROXY_METHODS)
async def proxy_backend(path: str, request: Request) -> Response:
    """Keeps the current web/API routes on the public port while the backend stays loopback-only."""
    return await _proxy_to_internal_api(request, request.url.path)
