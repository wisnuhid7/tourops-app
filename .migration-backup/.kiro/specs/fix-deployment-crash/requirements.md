# Requirements Document

## Introduction

The tourops production container crashes on startup due to duplicate imports in `server/routes.ts` and a puppeteer version incompatible with the Alpine Docker image. This document specifies the requirements for the hotfix.

## Glossary

- **Server**: The Express.js backend application (`server/routes.ts` and related modules)
- **Build_System**: The TypeScript compilation and bundling pipeline (`npm run build`)
- **Docker_Image**: The container image built from the project Dockerfile using `node:20-alpine`
- **Upload_Handler**: The multer-based file upload middleware and route (`/api/upload`)
- **Public_Tours_Endpoint**: The `/api/tours/public` API route serving published tours without authentication

## Requirements

### Requirement 1: Server starts without compilation errors

**User Story:** As a DevOps engineer, I want the server to compile and start without errors, so that the production container runs reliably.

#### Acceptance Criteria

1. THE Server SHALL contain exactly one import statement for each of `multer`, `path`, and `fs` in `server/routes.ts`
2. WHEN the Build_System compiles `server/routes.ts`, THE Build_System SHALL produce no duplicate identifier errors
3. IF duplicate imports exist in `server/routes.ts`, THEN THE Build_System SHALL fail compilation (current broken state that must be fixed)

### Requirement 2: File upload functionality works correctly

**User Story:** As an admin user, I want to upload images through the application, so that I can attach media to tours and content.

#### Acceptance Criteria

1. THE Server SHALL register exactly one `/api/upload` route handler
2. WHEN an authenticated user sends a POST request with a file to `/api/upload`, THE Upload_Handler SHALL save the file and return its URL
3. WHEN a request to `/api/upload` contains no file, THE Upload_Handler SHALL return a 400 status with an error message

### Requirement 3: PDF generation works in Docker Alpine container

**User Story:** As a DevOps engineer, I want puppeteer to install and run correctly in the Docker container, so that PDF generation features work in production.

#### Acceptance Criteria

1. THE Docker_Image SHALL install puppeteer version ^22.15.0 without errors during `npm install`
2. WHEN the Docker_Image is built, THE Build_System SHALL complete the build stage without puppeteer-related failures

### Requirement 4: /tours page accessible without authentication

**User Story:** As a public visitor, I want to browse available tours without logging in, so that I can discover tour offerings.

#### Acceptance Criteria

1. WHEN an unauthenticated HTTP GET request is made to `/api/tours/public`, THE Server SHALL respond with published tour data and a 200 status
2. WHEN the client renders the `/tours` route without a user session, THE Server SHALL serve the BrowseTours page without redirecting to login

### Requirement 5: Docker image builds and runs successfully

**User Story:** As a DevOps engineer, I want the Docker image to build and the container to start, so that I can deploy the latest version.

#### Acceptance Criteria

1. WHEN `docker build` is executed with the project Dockerfile, THE Docker_Image SHALL build successfully with exit code 0
2. WHEN the container starts, THE Server SHALL begin listening on the configured port without crashing
