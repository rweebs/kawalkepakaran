---
title: "Study Case of Graciella Valeska Liander: A Principal-Engineer-Grade Software Engineering Assessment of Her Smart Waste Management System Project"
sourceUrl: "https://www.infraloka.co.id/blog/study-case-of-graciella-valeska-liander-a-principal-engineer-grade-software-engineering-assessment-of-her-smart-waste-management-system"
archivedAt: 2026-10-10
lang: "en"
kind: "analisis"
status: "tidak-diketahui"
parties: ["graciella-valeska-liander"]
trimmed: false
draft: false
---
![Header illustration: case study involving Graciella Valeska Liander](/img/arsip-study-case-of-graciella-valeska-liander-a-principal-engineer-grade-software-engineering-as-header.webp)

![](/img/arsip-dfb6d67c9116338ff51b1fae.webp)

*A line-by-line engineering audit of Graciella Valeska Liander's Smart Waste Management System repository, benchmarked against Google/AWS full-time Associate Engineer standards, returns an overall score of 3.1/10 and a "not eligible" verdict — this is the full report.*

Before this became a story about anonymous harassment (that is a separate matter, documented elsewhere on this blog), Graciella Valeska Liander was, on paper, an impressive candidate: Cloud Solutions Consultant Intern at Google, an Institut Teknologi Bandung graduate, "Customer Engineer at Google Cloud" on LinkedIn, 6,493 followers, 500+ connections. The kind of profile that gets forwarded around as a role model.

This post is not about that controversy. It is a straight technical document: a Software Engineering Assessment Report evaluating one of her public engineering artifacts — the Smart Waste Management System (SWMS) project — against the standard a Principal Engineer at Google would apply when deciding whether a candidate is ready for a full-time Associate Engineer role. We are republishing the assessment in full, preserving every rating, finding, and recommendation, because the value of this kind of report is in its detail, not its headline.

## Assessment Metadata

| Field | Detail |
|---|---|
| Candidate | Graciella Valeska Liander |
| Position Evaluated For | Cloud Solutions Consultant Intern at Google |
| Evaluation Target | Full-Time Associate Engineer |
| Assessment Date | June 08, 2026 |
| Repository | Smart Waste Management System (SWMS) |
| Evaluation Standard | Principal Engineer at Google |
| Assessment Framework | SDLC Maturity, CI/CD Pipeline, Code Quality, Design Patterns |
| Assessment Prepared By | Principal Software Engineer (Google Standards) |

## Executive Summary

This assessment evaluates Graciella's Smart Waste Management System project against enterprise-grade software engineering standards expected at Google for full-time Associate roles. The evaluation focuses on Software Development Lifecycle (SDLC) maturity, CI/CD practices, code quality indicators, and architectural decision making.

| Category | Rating | Remarks |
|---|---|---|
| Software Lifecycle Management | 3.5/10 | Minimal structure |
| CI/CD Pipeline & Deployment | 2/10 | No automation |
| Code Quality & Maintainability | 4/10 | Moderate issues |
| Design & Architecture | 5/10 | Functional but basic |
| Testing & Quality Assurance | 2/10 | Inadequate coverage |
| Security & Production Readiness | 2/10 | Critical concerns |
| Documentation & Communication | 3/10 | Minimal effort |
| **OVERALL RATING** | **3.1/10** | **Entry-level work** |

**STATUS: NOT ELIGIBLE TO PROCEED TO FULL-TIME ASSOCIATE ROLE**

Graciella Valeska Liander is NOT READY to proceed to a full-time Associate Engineer position at Google, AWS, or similar enterprises at this time.

- **Current Assessment:** Entry-level/Junior internship work
- **Deficiencies:** Critical gaps in testing, CI/CD, security, and production engineering
- **Timeline to Readiness:** 3-6 months with structured mentoring
- **Recommendation:** Offer structured internship extension with clear technical milestones and mentorship before re-evaluation for full-time role.

## Project Overview

**Project Name:** Smart Waste Management System (SWMS)

**Technology Stack:**
- Frontend: React 18.0.0, React Google Charts, Responsive CSS
- Backend: Firebase Realtime Database
- Language: JavaScript (ES6+)
- Build Tool: Create React App (CRA) with react-scripts 5.0.1

**Codebase Size:**
- Total Lines of Code: 277 lines
- Main Component: App.js (216 lines)
- Test Files: 1 (App.test.js with 1 passing test)
- Git Commits: 14 commits over 4 days (April 22-26, 2022)

**Functional Purpose:** Monitors waste management systems with IoT sensors, displays real-time data visualization via Google Charts, and provides alerts for full bins and odor levels.

## 1. Software Development Lifecycle (SDLC) Maturity

**Rating: 3.5/10**

### Strengths
- Basic version control with Git (14 commits with clear messages)
- Responsive UI implementation (mobile-first design considerations)
- Component-based React architecture (single component model)

### Critical Issues
1. **No Development Processes:** Missing sprint planning, requirements documentation, design reviews.
2. **Monolithic Component:** 216 lines in single App.js component violates separation of concerns. Enterprise systems require modular, reusable components. No component composition hierarchy.
3. **No Code Standards:** Missing configuration for ESLint, Prettier, or code formatting. Default CRA config only.
4. **Shallow Git History:** Commit messages like "fix bug", "add responsive" lack context. Missing commit bodies explaining WHY changes were made.
5. **No Requirements Traceability:** Zero evidence of requirements documentation, acceptance criteria, or user story tracking.
6. **Single Author Commits:** All 14 commits by Graciella only. No collaboration indicators or code review process.
7. **Hardcoded Magic Numbers:** Distance threshold 10cm and gas threshold 600 hardcoded in business logic with no parameterization.

### Expected at Associate Level
- At minimum: PR review workflows, branch protection rules, merge requirements
- Documented architecture decisions (ADR format)
- Clear separation between infrastructure and application code
- Dependency management with lock files properly versioned
- Configuration management (dev/staging/prod environments)

## 2. CI/CD Pipeline & Deployment Automation

**Rating: 2/10**

### Current State
No CI/CD pipeline exists. Repository contains no configuration files for:
- GitHub Actions (`.github/workflows/`)
- GitLab CI (`.gitlab-ci.yml`)
- CircleCI (`.circleci/config.yml`)
- Jenkins (`Jenkinsfile`)
- Docker containerization (`Dockerfile`, `docker-compose.yml`)
- Infrastructure as Code (Terraform, CloudFormation)

Build and deployment are entirely manual processes.

### Critical Issues
1. **No Automated Testing:** Zero test execution on commits or PRs. The single test file (App.test.js) is a template placeholder that tests the wrong component.
2. **No Build Verification:** No automated validation that code compiles, bundles, or runs.
3. **No Deployment Pipeline:** Manual deployment means high risk of human error, inconsistent environments, and no rollback procedures.
4. **No Environment Separation:** Single Firebase config hardcoded in firebase.js. No dev/staging/production database separation.
5. **No Release Management:** No version tagging, release notes, or deployment tracking.
6. **No Security Scanning:** Missing dependency vulnerability checks (npm audit), SAST tools, or secrets scanning.

### Enterprise Standards Gap
At Google and AWS, every code change must pass:
- Automated test suite with >80% coverage
- Linting and code quality gates
- Security vulnerability scanning
- Build verification
- Automated deployment with blue-green or canary strategies
- Rollback capabilities with instant revert

This project has none of these controls.

## 3. Code Quality & Maintainability

**Rating: 4/10**

### Code Smells Detected

1. **Race Conditions in useEffect (Line 46):** The dependency array `[data]` in the second useEffect triggers on data changes, but `setLastData` uses `lastData` from previous render. This causes stale closure issues and potential infinite loops under certain conditions.
2. **Missing Error Handling (Line 25-27):** The Firebase query catch block only logs errors to console. No user feedback, retry logic, or error recovery. Production systems cannot rely on console logs.
3. **Mixed Concerns in Single Component:** Data fetching, state management, UI rendering, and business logic all in one 216-line component. No separation means difficult testing, reuse, and maintenance.
4. **Magic Numbers (Lines 50, 53):** Thresholds hardcoded: `distance < 10`, `gasValue > 600`. These should be constants or configurable parameters, not scattered through logic.
5. **Unused Console.log (Line 20, 33):** Commented and active console logs remain in production code. Indicates incomplete cleanup and lack of debugging discipline.
6. **Redundant Window Check (Lines 59-68, 74-83):** The `hasWindow` check is defensive against non-browser environments, but this is a browser-only React app. Unnecessary complexity and cargo cult coding.
7. **Conditional String Rendering (Lines 118, 128, 143):** Duplicated color logic and status mapping. Should be extracted to constants or helper functions for maintainability.
8. **Inline Styles Throughout:** All styling in JSX (lines 87-144, 155-195). Makes theming impossible, violates DRY principle, and complicates responsive design. CSS-in-JS or stylesheet separation required.

### Testing Analysis
App.test.js (8 lines) contains a placeholder test that searches for "learn react" text. This test:
- Does not exist in the actual App component
- Will fail on execution
- Demonstrates template copy-paste without understanding
- Indicates no real test coverage for the application

**Expected:** Unit tests for data fetching, state transitions, and alert triggers. Integration tests for Firebase integration.

## 4. Design & Architectural Decisions

**Rating: 5/10**

### Technology Choices

**Positive Aspects:**
- React 18 is modern and appropriate for UI-driven applications
- Firebase Realtime Database enables real-time sensor data ingestion
- Google Charts provides out-of-box charting without D3 complexity

**Concerns:**
- No data persistence layer abstraction. Firebase calls directly in React component.
- React 18 features (Suspense, Concurrent rendering) not utilized
- Create React App defaults used without customization for production needs (bundle analysis, error boundaries)

### Architectural Concerns

1. **Monolithic Data Fetching (Lines 14-28):** Fetches all historical data on mount without pagination or filtering. Scalability risk: 1000s of sensor readings become unmaintainable.
2. **Inefficient Data Transformation (Lines 34-44):** Rebuilds entire chart arrays on every data change. No memoization or diffing. Performance degradation on large datasets.
3. **No State Management Pattern:** useState hooks scattered throughout component. No context provider, Redux, or similar for predictable state updates. Makes debugging state flow difficult.
4. **Tight Coupling to Firebase:** firebase.js exports `db` directly. No adapter pattern or dependency injection. Difficult to mock for testing or swap Firebase for alternative backend.
5. **Responsive Design Without Mobile-First:** Breakpoint checks use `windowDimensions.width < 600` directly in JSX. Should use CSS media queries or CSS Grid for better separation.

### Design Patterns Missing
- No Container/Presenter pattern for testability
- No Error Boundary for graceful error handling
- No Custom Hooks for data fetching logic reuse
- No Composition patterns (compound components)
- No Memoization for performance optimization

## 5. Security & Production Readiness

**Rating: 2/10**

### Critical Security Issues

1. **Exposed Secrets (firebase.js, Lines 4-13):** Firebase API key, auth domain, and database URL hardcoded in source code and committed to public GitHub repository. This is a critical vulnerability. Anyone can access the Firebase database directly. Should use environment variables (.env files, never commit credentials).
2. **No Input Validation:** Alert messages directly display data without sanitization. Potential XSS if sensor data is compromised.
3. **Missing Content Security Policy:** No CSP headers to prevent injection attacks.
4. **No HTTPS Enforcement:** Firebase URL accessible over HTTP. Real-time data should use encrypted channels only.
5. **No Dependency Security Audits:** firebase@9.6.11 and react-scripts@5.0.1 likely have known vulnerabilities. No npm audit or automated scanning in place.
6. **No Error Boundaries:** Unhandled errors crash entire application. No fallback UI or error logging.
7. **No Rate Limiting on Firebase Queries:** Potential for runaway costs from repeated full database scans.
8. **No Authentication/Authorization:** Anyone with the API key can read and potentially write to Firebase. No user authentication or role-based access control.

### Production Readiness Checklist — Not Ready For Production

- [ ] No error handling or logging service
- [ ] No monitoring or alerting
- [ ] No analytics or instrumentation
- [ ] No backup or disaster recovery plan
- [ ] No load testing or scalability analysis
- [ ] No API rate limiting
- [ ] No database indexing strategy documented
- [ ] No performance optimization (lazy loading, code splitting)
- [ ] No accessibility compliance (WCAG 2.1)
- [ ] No browser compatibility testing

## 6. Documentation & Communication

**Rating: 3/10**

**README.md:** Default Create React App template. No project-specific documentation. No setup instructions for local development, Firebase configuration, or deployment procedures.

**Code Comments:** Minimal inline comments. Lines 20 and 33 have commented-out console.log statements indicating incomplete cleanup.

**Architecture Documentation:** Zero architectural decision records (ADR), design documents, or system diagrams.

**API Documentation:** No Firebase schema documentation or data model specification.

**Setup Instructions:** No clear steps to:
- Clone and install dependencies
- Configure Firebase project
- Run development server
- Deploy to production

### Expected at Associate Level
- Detailed README with architecture overview
- Setup guide for new developers
- ADR documents for significant decisions
- API specification with examples
- Troubleshooting guide
- Contribution guidelines

## 7. Dependency Management & Build Configuration

**Rating: 3.5/10**

### Dependency Analysis (package.json)
- react@18.0.0 (current, good)
- firebase@9.6.11 (acceptable, but manual security audits needed)
- react-google-charts@4.0.0 (appropriate for dashboard use case)

### Issues
1. Caret (^) versions allow breaking changes
2. No explicit patch versions pinned for reproducibility
3. No dev dependencies separated from runtime
4. No lock file committed to source control (package-lock.json exists but not tracked in git)
5. No dependency audit script in CI/CD (doesn't exist)

### Missing Production Dependencies
- No error tracking (Sentry)
- No logging service
- No analytics
- No monitoring client

### Unused Default Scripts
- `react-scripts eject` (enabled but discouraged)
- No custom build optimization

## 8. Comparative Analysis: Expected vs. Actual

| Capability | Google Standard | Actual State | Gap |
|---|---|---|---|
| Test Coverage | >80% | 0% | Critical |
| CI/CD Pipeline | Automated on every commit | Manual deployment | Critical |
| Code Review Process | Mandatory, multi-reviewer | No PRs or reviews | Critical |
| Security Audits | Continuous + Manual | None | Critical |
| Documentation | Comprehensive | Minimal | High |
| Error Handling | Centralized, logged | Console only | Critical |
| Monitoring/Logging | Full stack instrumented | None | Critical |
| Configuration Management | Environment-based | Hardcoded | High |
| Component Architecture | Modular, reusable | Monolithic | Medium |
| Performance Analysis | Measured, optimized | Not done | Medium |

*Note: Gaps marked as 'Critical' require immediate attention before production deployment or full-time hiring.*

## 9. Overall Assessment & Recommendations

**Final Rating: 3.1/10**

### Assessment Summary
This project demonstrates foundational competency with React and Firebase but falls significantly short of professional software engineering standards expected at Google or AWS for full-time Associate engineers. The work is suitable for a school project (which it appears to be, from 2022 timestamps and group credits), but requires substantial improvements for production environments or full-time employment.

### Key Deficiencies
1. **Zero Testing Culture:** No unit tests, integration tests, or test-driven development practices.
2. **No Operational Maturity:** Absence of CI/CD, monitoring, logging, and error handling prevents production deployment.
3. **Security Vulnerabilities:** Hardcoded secrets and no authentication represent showstoppers for any production system.
4. **Monolithic Architecture:** Single 216-line component violates software engineering principles and limits scalability.
5. **Manual Processes:** All building, testing, and deployment are manual, error-prone, and unverifiable.
6. **Missing Documentation:** Insufficient documentation makes onboarding, maintenance, and debugging difficult.
7. **No Code Quality Standards:** Missing ESLint, Prettier, and code review processes.

### Potential For Growth — Positive Indicators
- Successfully shipped a working web application with real-time data visualization
- Demonstrated ability to integrate third-party services (Firebase, Google Charts)
- Responsive design implementation shows attention to UX
- Clear commit messages indicate some development discipline

With proper mentoring and exposure to enterprise practices, Graciella has foundation to grow into a competent engineer. The gaps are learnable, not fundamental ability issues.

### Recommendations for Improvement (Priority Order)

**IMMEDIATE (Before Production or Full-Time Hire):**
1. Secure API Keys: Move Firebase config to environment variables. Never commit secrets to git.
2. Add Automated Testing: Implement Jest unit tests for components and Firebase integration tests. Target 80%+ coverage.
3. Implement CI/CD: Set up GitHub Actions to run tests, linting, and build on every push.
4. Refactor Components: Break 216-line App.js into smaller, testable components (ChartContainer, StatusCard, AlertService).

**SHORT TERM (1-2 Weeks):**
5. Add Error Handling: Implement Error Boundary component, centralized error logging (Sentry or similar).
6. Configure Code Quality Tools: ESLint (airbnb-config), Prettier, and pre-commit hooks.
7. Write Comprehensive README: Setup guide, architecture diagrams, Firebase configuration steps.
8. Fix Magic Numbers: Extract thresholds to configuration constants or database-backed settings.

**MEDIUM TERM (1-2 Months):**
9. Implement Monitoring/Logging: Add structured logging, APM, and performance monitoring.
10. Security Audit: Conduct dependency audit, implement CSP headers, add rate limiting.
11. Add Environment Management: Separate dev/staging/production configurations.
12. Performance Optimization: Implement React.memo, useMemo, and code splitting.

**LONG TERM (Ongoing):**
13. Establish Code Review Process: Require peer review for all changes.
14. Create Architecture Documentation: ADRs for all major decisions.
15. Set Up Analytics: Track usage patterns, performance metrics, user behavior.

## 10. Interview & Hiring Guidance

### Suggested Interview Focus Areas — Technical Questions to Explore
1. **Testing Philosophy:** Ask why tests weren't included. Assess understanding of test pyramid, TDD, mocking.
2. **Security Awareness:** Present the hardcoded secrets scenario. Evaluate if they recognize the risk and know remediation.
3. **Scale Thinking:** Ask how the system would handle 1000 waste bins. Do they think about database queries, pagination, caching?
4. **Architecture Decisions:** Why choose Firebase over REST API? Tradeoffs between real-time updates and scalability?
5. **Production Readiness:** What's needed before deploying this to 100k users? Understand monitoring, logging, error handling.

### Positive Signals
- Acknowledges gaps and explains as learning project
- Demonstrates awareness of testing and CI/CD importance
- Shows curiosity about enterprise patterns
- Asks about scale and operational concerns
- References learning from mistakes

### Red Flags
- Defensive about code quality issues
- Unaware of security risks (exposed secrets)
- Treats testing as optional or low priority
- Cannot articulate why CI/CD matters
- No awareness of production requirements

### Hiring Decision Recommendation

**NOT READY FOR IMMEDIATE HIRE** as full-time Associate Engineer. Current state represents junior internship work. With structured mentoring over 3-6 months, could become competent Associate.

Recommend:
- Offer mentored internship extension with clear technical milestones
- Assign code review partner for every contribution
- Require completion of testing, CI/CD, and security training modules
- Pair on production-grade project improvements
- Re-assess after internship extension

If evaluated for full-time Associate role now: Recommend "Not Ready" with offer to continue internship with structured growth plan. At Associate level, expects immediate productivity with minimal supervision. This candidate requires hands-on mentoring and cannot independently maintain production systems.

## Detailed Code Review Findings

### App.js Line-by-Line Analysis

**Lines 14-28: Initial Data Fetch**
- Issue: Fetches all historical data without pagination or filtering. As dataset grows, this becomes memory-intensive and slow.
- Expected: Implement pagination or limit to last N records. Add loading and error states.
- Severity: Medium (functions now, breaks at scale)

**Lines 30-46: Data Transformation Loop**
- Issue: Rebuilds entire arrays on every data change. O(n) operation on every state update. Inefficiency grows with data size.
- Recommendation: Use `useMemo` with dependency array to memoize calculations. Only recalculate when data actually changes.
- Example Fix:

```js
const distanceChart = useMemo(() => {
  if (!data) return undefined;
  let temp = [["Timestamp", "Distance"]];
  Object.entries(data).forEach(([timestamp, record]) => {
    temp.push([timestamp, record.distance]);
  });
  return temp;
}, [data]);
```

- Severity: Medium (performance degradation)

**Lines 48-57: Alert Logic**
- Issues:
  1. Browser `alert()` is poor UX. Interrupts user workflow, unreliable on mobile.
  2. Hardcoded thresholds (10, 600) not configurable.
  3. No alert de-duplication. Users see repeated alerts for same condition.
  4. No logging of alerts for monitoring/compliance.
- Recommendation: Use state-based toast notifications, database-backed config for thresholds, and alert history logging.
- Severity: High (poor UX, production-grade systems need better patterns)

**Lines 59-83: Window Resize Handling**
- Issue: Manual window size tracking is fragile and error-prone. React community settled on CSS-in-JS or CSS media queries as better approach.
- Recommendation: Use CSS media queries in stylesheet or CSS Grid for responsive layout. Eliminates the need for window tracking.
- Severity: Low (works correctly, but not best practice)

**firebase.js: Configuration Exposure**

CRITICAL SECURITY ISSUE: All Firebase credentials are hardcoded and committed to a public GitHub repository. Anyone can directly access the Firebase Realtime Database. Credentials exposed: API Key, Auth Domain, Database URL, Project ID, App ID.

IMMEDIATE ACTION REQUIRED:
1. Regenerate Firebase API key immediately
2. Remove this file from git history using `git-filter-branch` or similar
3. Move all credentials to `.env.local` file
4. Add `.env.local` to `.gitignore`
5. Configure Firebase security rules to require authentication

Severity: **CRITICAL** (data breach risk)

## Conclusion

Graciella's Smart Waste Management System demonstrates foundational competency with frontend frameworks and backend integration. The application successfully implements real-time data visualization and responsive UI design. However, the project lacks the operational maturity, test coverage, and security practices required for production systems or full-time Associate engineer roles at enterprises like Google or AWS.

The gap is not fundamental ability but rather exposure and discipline in enterprise software engineering practices. Testing, CI/CD, error handling, security awareness, and documentation are all learnable skills. With structured mentoring, Graciella has potential to grow into a competent full-stack engineer.

- For immediate hiring as full-time Associate: **NOT RECOMMENDED**
- For structured internship extension with mentoring: **RECOMMENDED**
- For internship continuation: Would benefit from on-the-job training in testing, CI/CD, and production engineering.

This assessment should be used constructively to guide growth and learning, not as final judgement. Enterprise engineering is a craft learned through hands-on experience and mentoring. The foundation exists here to build upon.

---

*This is a technical engineering assessment of a public repository/portfolio project and is unrelated to any other coverage on this blog concerning the same individual. It should not be read as commentary on any dispute, controversy, or personal conduct — it evaluates code, process, and engineering maturity only.*

**#EngineeringAssessment #SoftwareEngineering #GracielaValeskaLiander #CodeReview #CICD #Infraloka #RahmatWibowo**
