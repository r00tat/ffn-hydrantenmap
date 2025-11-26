# GEMINI Guidelines for the Hydranten-Map Project

This document provides guidelines for AI assistants (like Gemini) to effectively understand and contribute to this project.

## Project Overview

This is a web application for the Neusiedl am See fire department (`Freiwillige Feuerwehr Neusiedl am See`). Its primary purpose is to display the locations of fire hydrants on an interactive map to assist during emergency operations.

For authenticated users, the application offers advanced features, including:

- Real-time situation management (`Lageführung`).
- An operational diary (`Einsatztagebuch`).
- Management of other resources and tactical information.

The application is designed to be mobile-first and is a Progressive Web App (PWA) for offline accessibility.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (v16+) with the App Router.
- **Language**: [TypeScript](https://www.typescriptlang.org/).
- **UI Library**: [React](https://react.dev/) (v19+).
- **UI Components**: [Material-UI (MUI)](https://mui.com/).
- **Mapping**: [Leaflet](https://leafletjs.com/) via [React Leaflet](https://react-leaflet.js.org/).
- **Authentication**: [NextAuth.js](https://next-auth.js.org/) and [Firebase Authentication](https://firebase.google.com/docs/auth).
- **Backend & Database**: [Firebase](https://firebase.google.com/) (Firestore for data, Storage for files).
- **PWA**: [Serwist](https://serwist.pages.dev/) for service worker management.
- **Styling**: [Emotion](https://emotion.sh/).

## Project Structure

- `src/app/`: Contains the pages and routes of the application, following the Next.js App Router convention.
- `src/components/`: Houses reusable React components.
- `src/hooks/`: Includes custom React hooks for state management and side effects.
- `src/common/`: Utility functions and type definitions shared across the application.
- `src/server/`: Server-side logic, primarily for data import/export and processing scripts.
- `firebase/`: Contains Firestore rules and indexes for different environments (dev/prod).
- `public/`: Static assets, including map icons and PWA resources.

## Development Workflow

### Running the Application

To run the development server, use the following command. The app will be available at `http://localhost:3000`.

```bash
npm run dev
```

### Code Style and Linting

The project uses ESLint to enforce code style. To check for linting errors, run:

```bash
npm run lint
```

Please fix any new errors or warnings before committing code. Adhere to the existing coding style and conventions found in the project.

### Data Import Scripts

The project contains several scripts for importing and processing data from external sources (like Burgenland GIS). These are located in `src/server/` and can be run via `npm run <script_name>`.

- `npm run extract`: Extracts data from a `.har` file.
- `npm run import`: Imports CSV data into Firestore.

## Relevant Tools for Gemini

Based on the project's tech stack and structure, the following tools are most relevant for common tasks:

- **`read_file`**: To read the contents of files.
- **`write_file`**: To create new files.
- **`replace`**: To modify existing files.
- **`list_directory`**: To explore the file and directory structure.
- **`run_shell_command`**: To execute development scripts (`npm run dev`, `npm run lint`), install dependencies (`npm install`), or run data processing scripts.
- **`search_file_content`**: To quickly find code snippets, component usage, or specific configurations.
- **`codebase_investigator`**: For more complex queries about the codebase, dependencies, and architecture.
