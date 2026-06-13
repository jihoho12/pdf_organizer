import { defineServer, defineTool, onShutdown, createStorage, McpErrors, jsonLoggerPlugin, sanitizerPlugin, } from '@airmcp-dev/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
/** 오늘 날짜 폴더명 반환: "2025년 06월 12일" */
function todayFolderName() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}년 ${m}월 ${d}일`;
}
/** 특정 날짜 폴더명 반환 */
function dateFolderName(dateStr) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (iso) {
        const [, y, m, day] = iso;
        return `${y}년 ${m}월 ${day}일`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime()))
        throw McpErrors.invalidParams(`올바르지 않은 날짜: ${dateStr}`);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}년 ${m}월 ${day}일`;
}
/** 디렉토리가 없으면 생성 */
function ensureDir(dir) {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
/** 파일이 .pdf인지 확인 */
function isPdf(filePath) {
    return path.extname(filePath).toLowerCase() === '.pdf';
}
/** Date 객체로 폴더명 반환 */
function dateToFolderName(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}년 ${m}월 ${d}일`;
}
/** 중복 파일명 처리: file.pdf → file(1).pdf → file(2).pdf */
function resolveDestPath(destDir, fileName) {
    let dest = path.join(destDir, fileName);
    if (!fs.existsSync(dest))
        return dest;
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let i = 1;
    while (fs.existsSync(dest)) {
        dest = path.join(destDir, `${base}(${i})${ext}`);
        i++;
    }
    return dest;
}
// ─── Storage ─────────────────────────────────────────────────────────────────
const store = await createStorage({ type: 'file', path: path.join(__dirname, '../.air/data') });
onShutdown(async () => {
    await store.close();
});
// ─── Tools ───────────────────────────────────────────────────────────────────
/**
 * PDF 파일 하나를 오늘 날짜 폴더로 이동/복사
 */
const organizePdfTool = defineTool('organize_pdf', {
    description: 'PDF 파일을 오늘 날짜(YYYY년 MM월 DD일) 폴더로 자동 정리합니다. ' +
        'source_path에 PDF 경로, base_dir에 정리할 루트 폴더를 지정하세요.',
    params: {
        source_path: {
            type: 'string',
            description: '정리할 PDF 파일의 절대 또는 상대 경로',
        },
        base_dir: {
            type: 'string',
            description: '날짜 폴더를 만들 루트 디렉토리 (예: ~/Downloads/PDFs)',
        },
        copy: {
            type: 'boolean',
            description: 'true이면 복사, false(기본)이면 이동',
            optional: true,
        },
        date_override: {
            type: 'string',
            description: '날짜를 강제 지정할 경우 "YYYY-MM-DD" 형식으로 입력 (기본: 오늘)',
            optional: true,
        },
    },
    handler: async ({ source_path, base_dir, copy = false, date_override }) => {
        const srcAbs = path.resolve(source_path);
        if (!fs.existsSync(srcAbs)) {
            throw McpErrors.invalidParams(`파일이 존재하지 않습니다: ${srcAbs}`);
        }
        if (!isPdf(srcAbs)) {
            throw McpErrors.invalidParams(`PDF 파일이 아닙니다: ${srcAbs}`);
        }
        const folderName = date_override ? dateFolderName(date_override) : todayFolderName();
        const destDir = path.resolve(base_dir, folderName);
        ensureDir(destDir);
        const fileName = path.basename(srcAbs);
        const destPath = resolveDestPath(destDir, fileName);
        if (copy) {
            fs.copyFileSync(srcAbs, destPath);
        }
        else {
            fs.renameSync(srcAbs, destPath);
        }
        // 이력 기록
        await store.append('history', {
            action: copy ? 'copy' : 'move',
            from: srcAbs,
            to: destPath,
            folder: folderName,
        });
        return {
            result: copy ? '복사 완료' : '이동 완료',
            folder: folderName,
            destination: destPath,
        };
    },
});
/**
 * 디렉토리 내 모든 PDF를 날짜 폴더로 일괄 정리
 */
const organizeDirectoryTool = defineTool('organize_directory', {
    description: '특정 디렉토리 안에 있는 모든 PDF 파일을 오늘 날짜 폴더로 일괄 정리합니다.',
    params: {
        source_dir: {
            type: 'string',
            description: 'PDF들이 있는 소스 디렉토리',
        },
        base_dir: {
            type: 'string',
            description: '날짜 폴더를 만들 루트 디렉토리',
        },
        copy: {
            type: 'boolean',
            description: 'true이면 복사, false(기본)이면 이동',
            optional: true,
        },
        date_override: {
            type: 'string',
            description: '날짜를 강제 지정 (YYYY-MM-DD)',
            optional: true,
        },
        recursive: {
            type: 'boolean',
            description: '하위 폴더까지 탐색 여부 (기본: false)',
            optional: true,
        },
    },
    handler: async ({ source_dir, base_dir, copy = false, date_override, recursive = false }) => {
        const srcAbs = path.resolve(source_dir);
        if (!fs.existsSync(srcAbs)) {
            throw McpErrors.invalidParams(`디렉토리가 존재하지 않습니다: ${srcAbs}`);
        }
        // PDF 수집
        const pdfs = [];
        const collect = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory() && recursive) {
                    collect(full);
                }
                else if (entry.isFile() && isPdf(full)) {
                    pdfs.push(full);
                }
            }
        };
        collect(srcAbs);
        if (pdfs.length === 0) {
            return { result: 'PDF 파일이 없습니다.', moved: 0, files: [] };
        }
        const folderName = date_override ? dateFolderName(date_override) : todayFolderName();
        const destDir = path.resolve(base_dir, folderName);
        ensureDir(destDir);
        const results = [];
        for (const srcPath of pdfs) {
            const fileName = path.basename(srcPath);
            const destPath = resolveDestPath(destDir, fileName);
            if (copy) {
                fs.copyFileSync(srcPath, destPath);
            }
            else {
                fs.renameSync(srcPath, destPath);
            }
            results.push({ from: srcPath, to: destPath });
            await store.append('history', {
                action: copy ? 'copy' : 'move',
                from: srcPath,
                to: destPath,
                folder: folderName,
            });
        }
        return {
            result: `${results.length}개 PDF ${copy ? '복사' : '이동'} 완료`,
            folder: folderName,
            destination_dir: destDir,
            files: results,
        };
    },
});
/**
 * 날짜 폴더 목록 조회
 */
const listFoldersTool = defineTool('list_date_folders', {
    description: '정리된 날짜 폴더 목록과 각 폴더 내 PDF 파일 수를 조회합니다.',
    params: {
        base_dir: {
            type: 'string',
            description: '날짜 폴더들이 있는 루트 디렉토리',
        },
    },
    handler: async ({ base_dir }) => {
        const absDir = path.resolve(base_dir);
        if (!fs.existsSync(absDir)) {
            return { folders: [], total_pdfs: 0 };
        }
        const entries = fs.readdirSync(absDir, { withFileTypes: true });
        const folders = entries
            .filter((e) => e.isDirectory() && /^\d{4}년 \d{2}월 \d{2}일$/.test(e.name))
            .map((e) => {
            const folderPath = path.join(absDir, e.name);
            const pdfCount = fs
                .readdirSync(folderPath)
                .filter((f) => f.toLowerCase().endsWith('.pdf')).length;
            return { name: e.name, path: folderPath, pdf_count: pdfCount };
        })
            .sort((a, b) => a.name.localeCompare(b.name));
        const total = folders.reduce((s, f) => s + f.pdf_count, 0);
        return { folders, total_pdfs: total };
    },
});
/**
 * 특정 날짜 폴더 내 PDF 목록 조회
 */
const listPdfsTool = defineTool('list_pdfs_in_folder', {
    description: '특정 날짜 폴더 안의 PDF 파일 목록을 조회합니다.',
    params: {
        base_dir: {
            type: 'string',
            description: '루트 디렉토리',
        },
        date: {
            type: 'string',
            description: '조회할 날짜 (YYYY-MM-DD 또는 "오늘")',
        },
    },
    handler: async ({ base_dir, date }) => {
        const folderName = date === '오늘' ? todayFolderName() : dateFolderName(date);
        const folderPath = path.resolve(base_dir, folderName);
        if (!fs.existsSync(folderPath)) {
            return { folder: folderName, files: [], count: 0, exists: false };
        }
        const files = fs
            .readdirSync(folderPath)
            .filter((f) => f.toLowerCase().endsWith('.pdf'))
            .map((f) => {
            const filePath = path.join(folderPath, f);
            const stat = fs.statSync(filePath);
            return {
                name: f,
                path: filePath,
                size_kb: Math.round(stat.size / 1024),
                modified: stat.mtime.toISOString(),
            };
        });
        return { folder: folderName, path: folderPath, files, count: files.length, exists: true };
    },
});
/**
 * 정리 이력 조회
 */
const historyTool = defineTool('get_history', {
    description: '최근 PDF 정리 이력을 조회합니다.',
    params: {
        limit: {
            type: 'number',
            description: '조회할 최대 건수 (기본: 50)',
            optional: true,
        },
    },
    handler: async ({ limit = 50 }) => {
        const logs = await store.query('history', { limit });
        return {
            count: logs.length,
            history: logs.map((l) => ({
                action: l.action,
                from: l.from,
                to: l.to,
                folder: l.folder,
                time: l._ts,
            })),
        };
    },
});
/**
 * 파일의 수정일 기준으로 날짜 폴더에 자동 분류
 */
const organizeByDateTool = defineTool('organize_by_file_date', {
    description: '디렉토리 안의 PDF 파일을 각 파일의 날짜(수정일 또는 생성일) 기준으로 ' +
        '날짜별 폴더에 자동 분류합니다. 예: 6월 11일에 받은 파일 → "2026년 06월 11일" 폴더',
    params: {
        source_dir: {
            type: 'string',
            description: 'PDF들이 있는 소스 디렉토리',
        },
        base_dir: {
            type: 'string',
            description: '날짜 폴더를 만들 루트 디렉토리',
        },
        date_type: {
            type: 'string',
            description: '기준 날짜 종류: "modified"(수정일, 기본) 또는 "created"(생성일)',
            optional: true,
        },
        copy: {
            type: 'boolean',
            description: 'true이면 복사, false(기본)이면 이동',
            optional: true,
        },
        recursive: {
            type: 'boolean',
            description: '하위 폴더까지 탐색 여부 (기본: false)',
            optional: true,
        },
    },
    handler: async ({ source_dir, base_dir, date_type = 'modified', copy = false, recursive = false }) => {
        const srcAbs = path.resolve(source_dir);
        if (!fs.existsSync(srcAbs)) {
            throw McpErrors.invalidParams(`디렉토리가 존재하지 않습니다: ${srcAbs}`);
        }
        // PDF 수집
        const pdfs = [];
        const collect = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory() && recursive) {
                    collect(full);
                }
                else if (entry.isFile() && isPdf(full)) {
                    pdfs.push(full);
                }
            }
        };
        collect(srcAbs);
        if (pdfs.length === 0) {
            return { result: 'PDF 파일이 없습니다.', moved: 0, summary: {}, files: [] };
        }
        // 날짜별로 분류
        const summary = {};
        const results = [];
        for (const srcPath of pdfs) {
            const stat = fs.statSync(srcPath);
            // Windows에서 birthtime이 없으면 mtime으로 fallback
            const fileDate = date_type === 'created'
                ? (stat.birthtime.getFullYear() > 1970 ? stat.birthtime : stat.mtime)
                : stat.mtime;
            const folderName = dateToFolderName(fileDate);
            const destDir = path.resolve(base_dir, folderName);
            ensureDir(destDir);
            const fileName = path.basename(srcPath);
            const destPath = resolveDestPath(destDir, fileName);
            if (copy) {
                fs.copyFileSync(srcPath, destPath);
            }
            else {
                fs.renameSync(srcPath, destPath);
            }
            summary[folderName] = (summary[folderName] ?? 0) + 1;
            results.push({ from: srcPath, to: destPath, folder: folderName });
            await store.append('history', {
                action: copy ? 'copy' : 'move',
                from: srcPath,
                to: destPath,
                folder: folderName,
            });
        }
        return {
            result: `${results.length}개 PDF를 날짜별로 ${copy ? '복사' : '이동'} 완료`,
            date_type,
            summary, // { "2026년 06월 11일": 10, "2026년 06월 12일": 5 } 형태
            files: results,
        };
    },
});
// ─── Server ───────────────────────────────────────────────────────────────────
const server = defineServer({
    name: 'pdf-organizer',
    version: '1.0.0',
    description: 'PDF 파일을 날짜별 폴더로 자동 정리하는 MCP 서버',
    transport: { type: 'stdio' },
    storage: { type: 'file', path: path.join(__dirname, '../.air/data') },
    use: [
        sanitizerPlugin({ stripHtml: true, stripControl: true }),
        jsonLoggerPlugin({ output: 'stderr', logParams: false }),
    ],
    tools: [
        organizePdfTool,
        organizeDirectoryTool,
        organizeByDateTool,
        listFoldersTool,
        listPdfsTool,
        historyTool,
    ],
});
server.start();
