# VtM Chat — Design Spec
**Date:** 2026-05-16  
**Topic:** Vampire: The Masquerade interactive story assistant  
**Stack:** TypeScript + LangChain.js + LangGraph.js + Ollama + LanceDB + Google Drive

---

## Overview

Локальное приложение для интерактивной игры в Vampire: The Masquerade на основе книги Chicago by Night (2nd Edition, RU). Игрок общается с системой напрямую — система играет роль рассказчика/GM.

Три независимые фазы, каждая строится поверх предыдущей. Каждая фаза — отдельный спек → план → реализация.

---

## Key Decisions

| Решение | Выбор | Обоснование |
|---|---|---|
| Framework | LangChain.js + LangGraph.js | Граф состояний = граф сюжета; обучение оркестрации агентов |
| LLM | Ollama — qwen2.5:14b | Лучший русский язык в классе, влезает в RTX 3060 12GB, бесплатно |
| Embeddings | Ollama — nomic-embed-text | Полностью локально, бесплатно, поддерживает русский |
| Vector store | LanceDB (локальный файл) | TypeScript-native, нет сервера, интеграция с LangChain.js |
| Story storage | Google Drive JSON | Данные доступны и редактируемы; используется `googleapis` npm пакет с OAuth2 |
| Session state | Локальный JSON файл | Простейший вариант для локального приложения |
| Deployment | Локальное приложение | Нет VPS, нет облачных затрат |
| Story branches | Гибрид | Скелет предгенерируется, детали заполняются динамически при игре |
| User role | Игрок = прямое взаимодействие | Система играет рассказчика/GM |

---

## Architecture

```
ФАЗА 1 — Ingestion (один раз)
PDF → PDFLoader → TextSplitter → OllamaEmbeddings → LanceDB

ФАЗА 2 — Story PreGen (один раз, до игры)
LanceDB Retriever → LangGraph PreGen Agent → nodes.json + edges.json + lore.json → Google Drive

ФАЗА 3 — Chat (во время игры)
Игрок → React UI → Express SSE → LangGraph Chat Agent ↔ LanceDB + Google Drive → qwen2.5:14b stream
```

---

## Data Model

### LanceDB — таблица `chunks`
```typescript
{
  id: string            // uuid
  content: string       // текст чанка (русский)
  embedding: number[]   // 768-dim (nomic-embed-text)
  source_page: number   // страница из PDF
  chunk_type: 'lore' | 'character' | 'location' | 'faction'
  entity_name: string   // имя сущности или "" для общего лора
}
```

### Google Drive — nodes.json
```typescript
{
  id: string
  title: string
  description_template: string  // шаблон с {{details}} placeholder
  npc_ids: string[]
  location: string
  type: 'intro' | 'scene' | 'climax' | 'ending'
  is_expanded: boolean          // true = LLM уже заполнил детали
}[]
```

### Google Drive — edges.json
```typescript
{
  id: string
  from_node_id: string
  to_node_id: string
  choice_text: string   // текст выбора, который видит игрок
  condition: string     // "" или "only_if: visited:<node_id>"
}[]
```

### Google Drive — lore.json
```typescript
{
  id: string
  type: 'character' | 'location' | 'faction'
  name: string
  summary: string   // краткое описание, извлечённое LLM
}[]
```

### Local — data/session.json
```typescript
{
  id: string
  player_name: string
  current_node_id: string
  visited_nodes: string[]
  history: { role: 'user' | 'assistant', content: string }[]
}
```

---

## Phase 1: RAG Ingestion Pipeline

**Скрипт:** `npm run ingest`  
**Входные данные:** `Chicago_by_Night_(2nd_Edition)_ru.pdf`  
**Выход:** LanceDB таблица `chunks` (~500–1500 записей)

### Шаги
1. **PDF Loading** — LangChain `PDFLoader` (pdfjs-dist). Важно: проверить корректность извлечения кириллицы.
2. **Chunking** — `RecursiveCharacterTextSplitter`: `chunkSize: 1000`, `overlap: 200`. Разделители: `\n\n` → `\n` → `. ` → ` `.
3. **Metadata enrichment** — LLM-классификатор на мини-батчах присваивает `chunk_type` и `entity_name`.
4. **Embeddings** — `OllamaEmbeddings` с моделью `nomic-embed-text` (768 dims).
5. **Store** — `LanceDBVectorStore` из `@langchain/community`. Идемпотентно: повторный запуск не дублирует чанки.

### Retriever Interface
```typescript
const retriever = vectorStore.asRetriever({ k: 5 })
const docs = await retriever.invoke("клан Тремер в Чикаго")
```

### Ожидаемые результаты
- ~500–1500 чанков, LanceDB файл ~20–50MB
- Время: 2–10 минут (зависит от скорости Ollama на CPU для эмбеддингов)
- Стоимость: $0

---

## Phase 2: Story Branch Engine

**Скрипт:** `npm run pregen`  
**Входные данные:** LanceDB Retriever  
**Выход:** nodes.json, edges.json, lore.json → Google Drive

### LangGraph StateGraph — PreGen Agent

```
extract_lore → generate_skeleton → validate_graph → save_to_drive
                     ↑                    |
                     └────── retry ←──────┘ (если граф невалидный)
```

**extract_lore:** RAG-запросы к LanceDB: список NPC, ключевые локации, конфликты и фракции. Формирует `lore.json`.

**generate_skeleton:** LLM (qwen2.5:14b) получает извлечённый лор + промпт. Генерирует 3 сюжетные арки по 5–7 сцен, в JSON формате: nodes + edges. Каждый node содержит `description_template` — скелет с placeholders, детали заполняются в Фазе 3.

**validate_graph:** Проверки:
- Все `edge.from_node_id` и `edge.to_node_id` существуют в nodes
- Нет изолированных nodes (кроме endings)
- Минимум один node типа `intro` и один `ending`
- Если ошибки: loop обратно в `generate_skeleton` с описанием проблем (max 3 попытки)

**save_to_drive:** `googleapis` + OAuth2 — создаёт/обновляет три JSON файла в папке проекта на Drive. Требует однократной OAuth2 авторизации при первом запуске (`npm run auth`).

### Параметры генерации
- Количество арок: 3
- Сцен на арку: 5–7
- Выборов на сцену: 2–3

---

## Phase 3: Chat Interface

**Запуск:** `npm run dev`  
**Компоненты:** Express.js backend + React + Vite frontend  
**Порт:** localhost:3000 (frontend), localhost:3001 (API)

### LangGraph StateGraph — Chat Agent

```
                    ┌─ rag_lookup ──────────────────┐
parse_intent → route┤                               ├→ generate_response → save_session
                    └─ navigate_graph → expand_scene ┘
```

**parse_intent:** LLM классифицирует ввод игрока:
- `lore_question` — вопрос про лор ("Кто такой Лукиан?")
- `make_choice` — выбор из предложенных вариантов
- `explore_scene` — свободное действие в текущей сцене

**rag_lookup:** (для lore_question) — LanceDB поиск → топ-5 чанков → LLM формирует ответ в контексте текущей сцены.

**navigate_graph:** (для make_choice / explore_scene) — определяет следующий node по edges.json. nodes.json и edges.json кэшируются в памяти при старте сервера; Drive запрашивается только при `expand_scene` (запись `is_expanded: true`).

**expand_scene:** Если `node.is_expanded === false` — RAG-запрос по ключевым словам сцены + LLM заполняет `description_template`. Сохраняет `is_expanded: true` обратно в Drive.

**generate_response:** qwen2.5:14b стримит нарратив. System prompt:
```
Ты — рассказчик в мире Vampire: the Masquerade. Стиль: мрачный готический нуар, 
атмосфера опасности и интриг. Язык: русский. Не выходи за рамки лора книги.
В конце сцены с выборами — предложи варианты нумерованным списком.
```

**save_session:** Обновляет `data/session.json`.

### API Endpoints
```
GET  /api/session          — загрузить текущую сессию
POST /api/session/new      — начать новую игру
POST /api/chat             — SSE стрим ответа агента
GET  /api/choices          — доступные выборы в текущем node
```

### Frontend
- React + Vite
- Чат с потоковым текстом (SSE)
- Кнопки выборов из `edges.json` текущего node
- Тёмная готическая тема (CSS)

---

## Project Structure

```
vtm-chat/
├── Chicago_by_Night_(2nd_Edition)_ru.pdf
├── data/
│   ├── lancedb/              # векторное хранилище (локально)
│   └── session.json          # текущая игровая сессия
├── docs/superpowers/specs/   # design docs
├── src/
│   ├── ingestion/
│   │   └── ingest.ts         # Phase 1: npm run ingest
│   ├── story/
│   │   └── pregen.ts         # Phase 2: npm run pregen
│   ├── chat/
│   │   ├── agent.ts          # LangGraph Chat Agent
│   │   └── server.ts         # Express + SSE
│   └── shared/
│       ├── retriever.ts      # LanceDB retriever factory
│       └── drive.ts          # Google Drive API utils (googleapis + OAuth2)
├── frontend/
│   └── src/
│       └── App.tsx
├── .gitignore                # включает data/lancedb, .superpowers
└── package.json
```

---

## Dependencies

```json
{
  "langchain": "latest",
  "@langchain/langgraph": "latest",
  "@langchain/community": "latest",
  "@langchain/ollama": "latest",
  "@lancedb/lancedb": "latest",
  "express": "latest",
  "typescript": "latest",
  "react": "latest",
  "vite": "latest",
  "googleapis": "latest"
}
```

---

## Learning Outcomes по фазам

| Фаза | Концепты |
|---|---|
| 1 | RAG pipeline, chunking strategy, embeddings, vector search |
| 2 | LangGraph StateGraph, agent self-correction loops, structured output |
| 3 | Multi-step agents, streaming, routing, session state management |

---

## Out of Scope (эта итерация)

- Мультиплеер
- Голосовой ввод/вывод
- Поддержка других книг VtM
- Eval / тестирование качества RAG
- Деплой на VPS
