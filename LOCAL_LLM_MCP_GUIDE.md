# Local LLM MCP Guide

이 문서는 `pdf-organizer-mcp`를 Claude Desktop이 아니라 로컬 LLM인 Ollama `gemma4:12b`와 함께 쓰기 위해 진행한 과정과 사용법을 정리한 것입니다.

## 목표

원하는 사용 방식은 아래처럼 자연어로 명령하면 PDF 정리 MCP가 실행되는 흐름입니다.

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Downloads에 있는 pdf를 C:\Users\user\Documents\PDFs 에 오늘 날짜로 복사 정리해줘"
```

전체 구조는 다음과 같습니다.

```text
PowerShell 자연어 명령
  -> pdf-organizer.cmd
  -> scripts/pdf-organizer-nl.mjs
  -> Ollama gemma4:12b가 자연어를 MCP tool call JSON으로 변환
  -> pdf-organizer MCP 서버 실행
  -> PDF 복사/이동
```

## 확인한 점

이 프로젝트는 Claude에 하드코딩된 서버가 아닙니다.

`src/index.ts`의 서버 설정은 MCP stdio 서버입니다.

```ts
transport: { type: 'stdio' }
```

README에 Claude Desktop 설정 예시가 있을 뿐이고, 실제 서버는 MCP 클라이언트라면 사용할 수 있는 구조입니다.

## 설치한 로컬 모델

Ollama는 이미 설치되어 있었고, 다음 모델을 내려받아 비교했습니다.

```powershell
ollama pull qwen3:8b
ollama pull gemma4:12b
```

현재 확인한 모델 목록 예시는 다음과 같습니다.

```text
gemma4:12b
qwen3:8b
gemma3:4b
```

테스트 결과 `gemma4:12b`가 MCP 인자 추론에서 더 적절했습니다. 특히 `source_dir`, `base_dir`, `copy`, `date_type` 같은 도구 인자를 더 정확히 고르는 편이라 최종 사용 모델로 정했습니다.

## 서버 실행 문제 수정

Node 24에서 MCP 서버를 실행할 때 ESM 모듈 안에서 `__dirname`을 사용해서 서버가 시작되지 않는 문제가 있었습니다.

수정한 파일:

- `src/index.ts`
- `dist/index.js`는 `npm run build`로 생성

추가한 내용:

```ts
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

이 수정 후 stdio MCP 서버가 정상 실행되었습니다.

## 추가한 래퍼

### 1. 명령형 MCP 래퍼

파일:

```text
scripts/mcp-organize-by-date.mjs
```

용도:

수정일 또는 생성일 기준으로 PDF를 날짜별 폴더에 정리합니다. 자연어 없이 직접 옵션으로 실행합니다.

예시:

```powershell
node scripts/mcp-organize-by-date.mjs --source "C:\Users\user\Downloads" --dest "C:\Users\user\Documents\PDFs" --copy
```

수정한 날짜 기준이 기본값입니다.

```powershell
node scripts/mcp-organize-by-date.mjs --source "C:\Users\user\Downloads" --dest "C:\Users\user\Documents\PDFs" --copy --recursive
```

이동하려면:

```powershell
node scripts/mcp-organize-by-date.mjs --source "C:\Users\user\Downloads" --dest "C:\Users\user\Documents\PDFs" --move
```

### 2. 자연어 MCP 래퍼

파일:

```text
scripts/pdf-organizer-nl.mjs
```

용도:

PowerShell에 자연어로 입력하면 Ollama `gemma4:12b`가 MCP 도구 호출로 변환하고 실행합니다.

내부적으로 사용하는 흐름:

```text
자연어 요청
  -> Ollama API http://127.0.0.1:11434/api/chat
  -> gemma4:12b tool call 생성
  -> MCP 서버의 organize_pdf / organize_directory / organize_by_file_date 호출
```

실행 전에는 기본적으로 변환된 MCP 호출을 보여주고 확인을 받습니다.

확인 없이 실행하려면 `--yes`를 붙입니다.

### 3. Windows용 짧은 실행 파일

파일:

```text
pdf-organizer.cmd
```

내용:

```bat
@echo off
node "%~dp0scripts\pdf-organizer-nl.mjs" %*
```

이 파일 덕분에 긴 `node scripts/pdf-organizer-nl.mjs` 대신 아래처럼 실행할 수 있습니다.

```powershell
.\pdf-organizer.cmd "자연어 명령"
```

## 자주 쓰는 명령

먼저 프로젝트 폴더로 이동합니다.

```powershell
cd C:\Users\user\AppData\Roaming\mcp\pdf-organizer-mcp
```

### 오늘 날짜 폴더로 복사

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Downloads에 있는 pdf를 C:\Users\user\Documents\PDFs 에 오늘 날짜로 복사 정리해줘"
```

결과 예시:

```text
C:\Users\user\Documents\PDFs\2026년 06월 12일\...
```

### 오늘 날짜 폴더로 이동

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Downloads에 있는 pdf를 C:\Users\user\Documents\PDFs 에 오늘 날짜로 이동 정리해줘"
```

주의: 이동은 원본이 사라집니다.

### 수정한 날짜 기준으로 날짜별 복사

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Downloads에 있는 pdf를 수정한 날짜 기준으로 C:\Users\user\Documents\PDFs 에 날짜별로 복사 정리해줘"
```

결과 예시:

```text
C:\Users\user\Documents\PDFs\2024년 06월 26일\...
C:\Users\user\Documents\PDFs\2025년 03월 15일\...
```

### 이미 오늘 폴더에 들어간 PDF를 수정일 기준으로 다시 분류

현재 PDF 위치:

```text
C:\Users\user\Documents\PDFs\2026년 06월 12일
```

목적지 루트:

```text
C:\Users\user\Documents\PDFs
```

먼저 복사로 테스트:

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Documents\PDFs\2026년 06월 12일 안의 pdf들을 수정한 날짜 기준으로 C:\Users\user\Documents\PDFs 에 날짜별로 복사 정리해줘"
```

확인 후 이동:

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Documents\PDFs\2026년 06월 12일 안의 pdf들을 수정한 날짜 기준으로 C:\Users\user\Documents\PDFs 에 날짜별로 이동 정리해줘"
```

### 날짜만 짧게 말해서 폴더 간 복사/이동

절대경로를 쓰지 않고 날짜만 두 개 말하면 기본 PDF 루트인 `C:\Users\user\Documents\PDFs` 아래 날짜 폴더로 해석합니다.

예:

```powershell
.\pdf-organizer.cmd "PDFs 6월11일 pdf들 6월12일로 복사"
```

위 문장은 아래처럼 해석됩니다.

```json
{
  "name": "organize_directory",
  "arguments": {
    "source_dir": "C:\\Users\\user\\Documents\\PDFs\\2026년 06월 11일",
    "base_dir": "C:\\Users\\user\\Documents\\PDFs",
    "copy": true,
    "date_override": "2026-06-12",
    "recursive": false
  }
}
```

기본 PDF 루트는 환경 변수 `PDF_ORGANIZER_BASE_DIR`로 바꿀 수 있습니다.

```powershell
$env:PDF_ORGANIZER_BASE_DIR = "D:\PDFs"
```

문장 안에 Windows 절대경로가 있으면 그 경로를 기본 PDF 루트보다 우선합니다.

```powershell
.\pdf-organizer.cmd "6월 11일 pdf들 D:\Archive\PDFs 6월 12일로 복사"
```

위 문장은 아래처럼 해석됩니다.

```json
{
  "source_dir": "D:\\Archive\\PDFs\\2026년 06월 11일",
  "base_dir": "D:\\Archive\\PDFs",
  "date_override": "2026-06-12",
  "copy": true
}
```

경로를 두 개 쓰면 첫 번째는 원본 루트, 두 번째는 목적지 루트로 봅니다.

```powershell
.\pdf-organizer.cmd "C:\Source\PDFs 6월 11일 pdf들 D:\Archive\PDFs 6월 12일로 복사"
```

### 하위 폴더까지 포함

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Downloads 안의 pdf들을 하위 폴더까지 포함해서 수정한 날짜 기준으로 C:\Users\user\Documents\PDFs 에 날짜별로 복사 정리해줘"
```

## 자연어가 MCP 도구로 변환되는 기준

자연어 래퍼는 대략 아래 기준으로 도구를 고르게 안내되어 있습니다.

- `오늘 날짜로 정리` -> `organize_directory`
- `수정한 날짜 기준`, `파일 날짜 기준`, `생성일 기준` -> `organize_by_file_date`
- `복사`, `원본 남겨줘` -> `copy: true`
- `복사 이동`처럼 `복사`와 `이동`이 함께 있으면 원본 유지를 위해 `copy: true`
- `이동`만 있으면 `copy: false`
- 날짜를 직접 지정하지 않으면 오늘 날짜는 MCP 서버가 자동 계산
- 하위 폴더 언급이 없으면 `recursive: false`

예를 들어 아래 자연어:

```text
pdf-organizer mcp로 C:\Users\user\Downloads에 있는 pdf를 C:\Users\user\Documents\PDFs 에 오늘 날짜로 복사 정리해줘
```

대략 아래 MCP 호출로 변환됩니다.

```json
{
  "name": "organize_directory",
  "arguments": {
    "source_dir": "C:\\Users\\user\\Downloads",
    "base_dir": "C:\\Users\\user\\Documents\\PDFs",
    "copy": true
  }
}
```

아래 자연어:

```text
pdf-organizer mcp로 C:\Users\user\Downloads에 있는 pdf를 수정한 날짜 기준으로 C:\Users\user\Documents\PDFs 에 날짜별로 복사 정리해줘
```

대략 아래 MCP 호출로 변환됩니다.

```json
{
  "name": "organize_by_file_date",
  "arguments": {
    "source_dir": "C:\\Users\\user\\Downloads",
    "base_dir": "C:\\Users\\user\\Documents\\PDFs",
    "date_type": "modified",
    "copy": true,
    "recursive": false
  }
}
```

## 테스트한 내용

테스트 폴더:

```text
.air\mcp-date-test
```

테스트 PDF:

```text
alpha.pdf - 수정일 2026-06-10
beta.pdf  - 수정일 2026-06-11
ignore.txt - PDF가 아니므로 무시
```

확인 결과:

- MCP 도구 목록 조회 성공
- `organize_by_file_date` 호출 성공
- 수정일 기준으로 `2026년 06월 10일`, `2026년 06월 11일` 폴더 분류 성공
- `copy: true`일 때 원본 유지 확인
- 중복 파일명은 `alpha(1).pdf`처럼 자동 처리 확인
- 자연어 요청을 `organize_directory` 호출로 변환하고 오늘 날짜 폴더 복사 성공

## 주의할 점

`복사`와 `이동`은 다릅니다.

- 복사: 원본이 남습니다.
- 이동: 원본이 사라집니다.

처음에는 항상 `복사`로 테스트하는 것을 추천합니다.

현재 자연어 래퍼는 실행 전에 MCP 호출 내용을 보여주고 확인을 받습니다. `--yes`를 붙이면 확인 없이 바로 실행됩니다.

Ollama가 실행 중이어야 자연어 래퍼가 동작합니다. 보통 Ollama는 백그라운드 서비스로 떠 있지만, 문제가 있으면 아래 명령으로 확인합니다.

```powershell
ollama list
```

모델이 안 떠 있으면 아래처럼 한 번 실행해볼 수 있습니다.

```powershell
ollama run gemma4:12b
```

`ollama run` 대화창에서 나가려면:

```text
/bye
```

## 한 줄 요약

이제 Claude Desktop 없이도 PowerShell에서 자연어로 PDF 정리를 실행할 수 있습니다.

```powershell
.\pdf-organizer.cmd "pdf-organizer mcp로 C:\Users\user\Downloads에 있는 pdf를 수정한 날짜 기준으로 C:\Users\user\Documents\PDFs 에 날짜별로 복사 정리해줘"
```
