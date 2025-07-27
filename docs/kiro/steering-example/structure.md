# Project Structure

## Root Directory Organization
```
├── frontend/           # React TypeScript application
├── backend/            # FastAPI Python application  
├── uploads/            # PDF file storage directory
├── .kiro/              # Kiro AI assistant configuration
├── docker-compose.yml  # Multi-service container orchestration
└── README.md           # Project documentation
```

## Frontend Structure (`frontend/`)
```
frontend/
├── src/
│   ├── components/     # Reusable React components
│   ├── types/          # TypeScript type definitions
│   │   ├── index.ts    # Core data models (Point, DrawingElement, etc.)
│   │   └── validation.ts # Type validation functions
│   ├── App.tsx         # Main application component
│   └── App.css         # Application styles
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── Dockerfile          # Container build instructions
```

## Backend Structure (`backend/`)
```
backend/
├── app/
│   ├── services/       # Business logic layer
│   ├── models.py       # Core data classes and enums
│   ├── validation.py   # Data validation functions
│   ├── main.py         # FastAPI application entry point
│   └── __init__.py     # Package initialization
├── tests/
│   ├── test_validation.py # Validation function tests
│   └── __init__.py     # Test package initialization
├── requirements.txt    # Python dependencies
└── Dockerfile          # Container build instructions
```

## Code Organization Patterns

### Data Models
- **Python**: Use dataclasses with type hints in `models.py`
- **TypeScript**: Use interfaces in `types/index.ts`
- **Enums**: Mirror between Python and TypeScript (ElementType, JobStatus)

### Validation
- **Comprehensive validation**: Both frontend and backend have matching validation logic
- **Error handling**: Custom ValidationError classes in both languages
- **Assertion functions**: Strict validation with clear error messages

### File Naming Conventions
- **Python**: snake_case for files and functions
- **TypeScript**: camelCase for variables, PascalCase for types/interfaces
- **Components**: PascalCase for React component files

### Import Organization
- **Python**: Standard library, third-party, local imports (separated by blank lines)
- **TypeScript**: External libraries, internal modules, relative imports

## Key Architectural Principles
- **Type Safety**: Strong typing enforced in both Python and TypeScript
- **Validation**: Dual validation on frontend and backend
- **Separation of Concerns**: Clear separation between models, validation, and business logic
- **Containerization**: Each service runs in isolated Docker containers
- **API-First**: Backend exposes RESTful API consumed by frontend