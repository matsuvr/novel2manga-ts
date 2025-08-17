# Technology Stack

## Architecture

Full-stack web application with containerized microservices architecture using Docker Compose.

## Frontend

- **Framework**: React 18 with TypeScript
- **PDF Rendering**: PDF.js for interactive PDF viewing
- **HTTP Client**: Axios for API communication
- **Build Tool**: Create React App with React Scripts
- **Testing**: Jest with React Testing Library

## Backend

- **Framework**: FastAPI (Python)
- **Server**: Uvicorn ASGI server
- **PDF Processing**: pdfplumber + PyMuPDF (fitz)
- **Image Processing**: OpenCV + Pillow
- **OCR**: Tesseract (pytesseract)
- **AI Integration**: OpenAI API
- **Data Processing**: pandas, numpy, scikit-learn
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Testing**: pytest with pytest-asyncio

## Development Environment

- **Containerization**: Docker + Docker Compose
- **Database**: PostgreSQL 15
- **Environment Management**: python-dotenv

## Common Commands

### Docker Development (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild containers
docker-compose up --build
```

### Manual Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install
npm start

# Testing
cd backend && pytest
cd frontend && npm test
```

## Environment Variables

- `REACT_APP_API_URL`: Frontend API endpoint (default: http://localhost:8000)
- `DATABASE_URL`: PostgreSQL connection string
- `UPLOAD_DIR`: File upload directory path
- `OPENAI_API_KEY`: Required for AI explanations

## Port Configuration

- Frontend: 3000
- Backend API: 8000
- PostgreSQL: 5432
