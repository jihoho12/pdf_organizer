# pdf-organizer-mcp

Air 프레임워크(https://docs.airmcp.dev/)로 만든
PDF 파일을 **날짜별 폴더**로 자동 정리하는 MCP 서버입니다.  
다운로드한 PDF가 쌓일 때마다 `2025년 06월 12일` 형식의 폴더에 깔끔하게 분류됩니다.

---

## 설치 및 실행

```bash
npm install
npm run build
```

---

## Claude Desktop 연결

`claude_desktop_config.json`에 아래 항목 추가:

```json
{
  "mcpServers": {
    "pdf-organizer": {
      "command": "node",
      "args": ["/절대경로/pdf-organizer-mcp/dist/index.js"]
    }
  }
}
```

---

## 제공 툴 5가지

| 툴 이름 | 설명 |
|---|---|
| `organize_pdf` | PDF 파일 1개를 오늘 날짜 폴더로 이동/복사 |
| `organize_directory` | 디렉토리 내 모든 PDF를 일괄 정리 |
| `list_date_folders` | 날짜 폴더 목록 + PDF 개수 조회 |
| `list_pdfs_in_folder` | 특정 날짜 폴더의 PDF 목록 조회 |
| `get_history` | 최근 정리 이력 조회 |

---

## 사용 예시 (Claude에게 말하기)

```
"~/Downloads/report.pdf 를 ~/Documents/PDFs 폴더에 오늘 날짜로 정리해줘"
→ organize_pdf 호출 → ~/Documents/PDFs/2025년 06월 12일/report.pdf

"~/Downloads 안의 PDF 전부 ~/Documents/PDFs 로 정리해줘"
→ organize_directory 호출 → 일괄 이동

"PDFs 폴더에 날짜별로 뭐가 있는지 보여줘"
→ list_date_folders 호출 → 폴더 목록 + 개수

"오늘 폴더에 있는 PDF 목록 보여줘"
→ list_pdfs_in_folder(date: "오늘")

"최근에 어떤 파일 정리했어?"
→ get_history 호출
```

---

## 파라미터 상세

### `organize_pdf`
| 파라미터 | 필수 | 설명 |
|---|---|---|
| `source_path` | ✅ | 정리할 PDF 경로 |
| `base_dir` | ✅ | 날짜 폴더를 만들 루트 디렉토리 |
| `copy` | ❌ | true이면 복사 (기본: 이동) |
| `date_override` | ❌ | 날짜 직접 지정 `YYYY-MM-DD` |

### `organize_directory`
| 파라미터 | 필수 | 설명 |
|---|---|---|
| `source_dir` | ✅ | PDF들이 있는 소스 디렉토리 |
| `base_dir` | ✅ | 날짜 폴더를 만들 루트 디렉토리 |
| `copy` | ❌ | true이면 복사 (기본: 이동) |
| `date_override` | ❌ | 날짜 직접 지정 `YYYY-MM-DD` |
| `recursive` | ❌ | 하위 폴더 탐색 여부 (기본: false) |

---

## 폴더 구조 예시

```
~/Documents/PDFs/
├── 2025년 06월 10일/
│   ├── invoice.pdf
│   └── contract.pdf
├── 2025년 06월 11일/
│   └── report.pdf
└── 2025년 06월 12일/
    ├── manual.pdf
    └── manual(1).pdf   ← 중복 파일명 자동 처리
```

---

## 특징

- 📁 **자동 폴더 생성**: 날짜 폴더가 없으면 자동으로 생성
- 🔄 **중복 파일명 처리**: `file.pdf` → `file(1).pdf` → `file(2).pdf`
- 📝 **이력 저장**: `.air/data` 에 정리 이력 영구 보존
- 📅 **날짜 오버라이드**: 과거/미래 날짜 폴더 지정 가능
- 🔁 **복사 모드**: 원본 유지하면서 정리 가능
