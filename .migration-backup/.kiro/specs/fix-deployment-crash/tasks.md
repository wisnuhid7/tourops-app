# Implementation Plan: Fix Deployment Crash

## Overview

Three-part hotfix to resolve the container crash: remove duplicate imports/routes in `server/routes.ts`, downgrade puppeteer to a version compatible with Alpine Docker, and verify public tours access works.

## Tasks

- [x] 1. Remove duplicate imports and duplicate upload route in server/routes.ts
  - [x] 1.1 Remove duplicate `multer`, `path`, `fs` imports on lines 35-37
    - These are exact duplicates of lines 4-6
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Remove duplicate upload multer config and /api/upload route handler (lines 258-274)
    - The first upload config (lines 39-50) and first route handler (line 155) must be kept
    - _Requirements: 2.1_

- [x] 2. Downgrade puppeteer version in package.json
  - [x] 2.1 Change `"puppeteer": "^24.43.1"` to `"puppeteer": "^22.15.0"` in package.json
    - Version 22.x is the last known working version with node:20-alpine
    - _Requirements: 3.1, 3.2_

- [x] 3. Verify build succeeds
  - [x] 3.1 Run `npm run build` and confirm it completes with exit code 0
    - This validates that the duplicate import removal fixed the compilation error
    - _Requirements: 1.2, 5.1_

- [x] 4. Verify /tours public access path
  - [x] 4.1 Confirm BrowseTours component calls `/api/tours/public` (no auth required)
    - Check `client/src/pages/customer/browse-tours.tsx` uses the public endpoint
    - _Requirements: 4.1, 4.2_
  - [x] 4.2 Confirm App.tsx routes `/tours` in the unauthenticated branch
    - The `!user` Switch in AppRouter should include `<Route path="/tours" component={BrowseTours} />`
    - _Requirements: 4.2_

- [x] 5. Final checkpoint
  - Ensure build passes, review all changes, ask the user if questions arise.
  - _Requirements: 5.1, 5.2_

## Notes

- This is a hotfix — no new features, no architectural changes
- After these fixes, rebuild the Docker image and update `docker-compose.prod.yml` to use the new tag
- The /tours redirect issue should self-resolve once the container starts successfully
- No property-based tests needed — all validations are smoke/integration checks
