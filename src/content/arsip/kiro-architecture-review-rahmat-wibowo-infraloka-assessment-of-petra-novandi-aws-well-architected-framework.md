---
title: "Kiro Architecture Review: Rahmat Wibowo of InfraLoka Assesses Petra Novandi's AWS Well-Architected Framework Case for Kiro"
sourceUrl: "https://www.infraloka.co.id/blog/kiro-architecture-review-rahmat-wibowo-infraloka-assessment-of-petra-novandi-aws-well-architected-framework"
archivedAt: 2026-10-10
lang: "en"
kind: "analisis"
status: "tidak-diketahui"
parties: ["amazon-web-services","petra-novandi-barus"]
trimmed: false
draft: false
---
![Header illustration: essay involving Amazon Web Services, Petra Novandi Barus](/img/arsip-kiro-architecture-review-rahmat-wibowo-infraloka-assessment-of-petra-novandi-aws-well-arch-header.webp)

![](/img/arsip-case-studies-image-fixed.webp)

*Rahmat Wibowo, CEO of InfraLoka, reviews Petra Novandi's (Former AWS Developer Advocate) AWS Well-Architected Framework assessment of Kiro, scoring the spec-driven development tool 7.5/10 with a verdict of "Invest in Kiro" — strong for startups, not yet ready for enterprise.*

**Reviewed by Rahmat Wibowo, CEO – InfraLoka | Kiro presentation by Petra Novandi, Former AWS Developer Advocate**

## Report Metadata

- **Title:** Kiro Architecture Review — AWS Well-Architected Framework Assessment
- **Presentation created by:** Petra Novandi, Former AWS Developer Advocate
- **Reviewed by:** Rahmat Wibowo, Chief Executive Officer, InfraLoka
- **Framework:** AWS Well-Architected Framework (6 Pillars)
- **Assessment Date:** June 3, 2026
- **Overall Score:** 7.5/10 (Very High Confidence)

## Important Context

Kiro's documentation was created by Petra Novandi, a Former AWS Developer Advocate. This credential significantly strengthens the credibility and strategic value of the Kiro presentation and methodology. The fact that a Former AWS Developer Advocate created this presentation means the architectural thinking is grounded in enterprise cloud experience, not product marketing theory.

## Executive Summary

Kiro presents a compelling, architecturally-sound solution to the "vibe coding" problem through spec-driven development methodology. Notably, this methodology was designed by a Former AWS Developer Advocate, which explains the strong alignment with AWS Well-Architected Framework principles.

The approach is production-ready for small to mid-market teams and has solid architectural foundations for enterprise adoption with strategic roadmap execution.

**Key Finding:** This is NOT accidental alignment with AWS principles — it's intentional design by someone with deep AWS expertise and enterprise advisory experience.

### Pillar Scores Summary

| AWS Pillar | Score | Status | Confidence |
|---|---|---|---|
| Operational Excellence | 6.5/10 | ATTENTION NEEDED | VERY HIGH |
| Security | 7/10 | GOOD | VERY HIGH |
| Reliability | 7/10 | GOOD | VERY HIGH |
| Performance Efficiency | 8/10 | STRONG | VERY HIGH |
| Cost Optimization | 6.5/10 | ATTENTION NEEDED | VERY HIGH |
| Sustainability | 5/10 | CRITICAL | HIGH |

## 1. Operational Excellence: 6.5/10

*Can teams reliably operate Kiro at scale?*

**Strengths**
- Clear three-phase workflow mirrors enterprise SDLC (AWS-designed thinking)
- Agent Hooks enable event-driven automation (AWS Lambda pattern)
- Steering Files preserve project context across handoffs
- Audit trail supports compliance requirements

**Gaps**
- Missing observability framework (SLA tracking, phase metrics)
- Operational runbooks undefined for failure recovery
- No dependency management strategy for external tools

**Recommendation:** Implement operational health dashboard with spec quality metrics, phase transition latency, and rework cycle analysis.

**Confidence in Assessment:** VERY HIGH (AWS advocate designed this, gaps are legitimate)

## 2. Security: 7/10

*Are security requirements properly integrated?*

**Strengths**
- Specs as security contracts (EARS notation enables specification)
- Code review clarity enforced against specs
- Audit trail evolves with code (SOC 2, ISO 27001 ready)
- Role definition prevents security shortcuts

**Gaps**
- No security-first phase (threat modeling missing)
- Supply chain security not addressed for MCP integrations
- Access control for spec management incomplete

**Recommendation:** Extend EARS notation with security acceptance criteria patterns.

**Confidence:** VERY HIGH (AWS background ensures security thinking)

## 3. Reliability: 7/10

*Is the system designed to recover from failures?*

**Strengths**
- Exceptional traceability: Every code line links to requirement
- Iterative checkpoints enable fault isolation
- Reordering capability provides manual control
- Property-based testing auto-generates test cases

**Gaps**
- No failure mode analysis (FMEA) for ambiguous specs
- Recovery procedures missing for phase conflicts
- Testing integration weak (no load/chaos testing)
- Deployment patterns undefined (no canary/rolling guidance)

**Recommendation:** Add resilience patterns with SLAs (15min phase transitions, automated rollback, parallel testing).

**Confidence:** VERY HIGH (Reliability mindset is core to AWS philosophy)

## 4. Performance Efficiency: 8/10

*Does Kiro enable fast, efficient development?*

**Strengths**
- Reduces context loss across handoffs (major problem solved)
- Parallelizable phases enable team velocity
- Agent hooks reduce manual toil
- Clear solution to vibe coding inefficiency

**Gaps**
- Quantified benchmarks missing ("faster" claimed, not proven)
- Time-to-production latency not tracked
- Scalability narrative missing (500-engineer teams?)

**Recommendation:** Publish performance benchmarks: "40% faster to production, 60% rework reduction, 2h → 10m handoff time."

**Confidence:** VERY HIGH (Performance efficiency was likely design priority)

## 5. Cost Optimization: 6.5/10

*Is Kiro a cost-effective solution?*

**Strengths**
- Rework reduction = long-term cost savings
- Single source of truth reduces communication overhead
- Pay-as-you-go pricing model
- Free tier enables adoption

**Gaps**
- Total Cost of Ownership (TCO) opaque
- Pricing unit unclear (50 interactions = how many specs?)
- Enterprise licensing undefined
- Hidden costs not transparent (training, Phase 1/2 investment)

**Recommendation:** Publish TCO calculator, cost per spec breakdown, competitive analysis, enterprise pricing.

**Confidence:** HIGH (This is legitimate product execution gap, not architecture gap)

## 6. Sustainability: 5/10

*Is Kiro designed for long-term success?*

**Strengths**
- Knowledge preservation through specs reduces turnover impact
- Codebase longevity enabled by traceability
- Community engagement (Discord, GitHub, hackathon)

**Gaps**
- Vendor lock-in risk (single vendor, no open-source path)
- Skill dependency (EARS notation fluency required)
- Environmental impact not addressed (GPU hours per spec)
- Long-term vision for enterprise adoption unclear

**Recommendation:** Establish enterprise stability: AWS IaC integration, certification program, open governance, green coding commitment.

**Confidence:** MEDIUM-HIGH (Valid concerns despite AWS pedigree)

## Critical Findings

**CRITICAL #1: Missing Non-Functional Requirements Strategy**
Specs focus on functional requirements only. Silent on performance SLOs, security standards, scalability limits, cost budgets.
*Impact:* Late NFR gap discovery = expensive rework.
*Confidence:* VERY HIGH

**CRITICAL #2: Insufficient Testing Integration**
Missing: integration tests across phases, load testing, chaos engineering integration.
*Impact:* Specs alone cannot validate production readiness.
*Confidence:* VERY HIGH

**CRITICAL #3: Team Scale Limits Unclear**
How do specs prevent simultaneous edit conflicts? Handle inter-team dependencies? Jira/Azure DevOps integration?
*Impact:* Adoption wall at 50+ engineers.
*Confidence:* VERY HIGH

**CRITICAL #4: Telemetry & Observability Gap**
No metrics on team velocity, code quality, spec adherence, rework cycles.
*Impact:* Enterprise teams cannot justify adoption without ROI data.
*Confidence:* VERY HIGH

## Strategic Recommendations

**CRITICAL PRIORITY (0–6 months)**
1. Observability Framework — Metrics dashboard, phase SLAs
2. NFR Strategy — Extend EARS for non-functional requirements
3. Scale Validation — Case study: 100→500 engineer scalability
4. Security Certification — SOC 2, HIPAA/PCI-DSS readiness

**MAJOR PRIORITY (6–12 months)**
5. Enterprise Integrations — Jira, Azure DevOps, REST API
6. Cost Transparency — TCO calculator, competitive analysis

**IMPORTANT PRIORITY (12+ months)**
7. Performance Benchmarks — Quantified velocity improvements
8. Sustainability — Open-source components, vendor stability

## Segment Recommendations

| Segment | Score | Recommendation | Confidence |
|---|---|---|---|
| Startups (5–50 engineers) | 8.5/10 | HIGHLY RECOMMENDED | VERY HIGH |
| Mid-Market (100–500 engineers) | 7/10 | GOOD WITH CONDITIONS | HIGH |
| Enterprise (5000+ engineers) | 6/10 | NOT YET READY | MEDIUM-HIGH |

## What Kiro Gets Right

1. **Solves Real Problem:** Vibe coding creates technical debt; spec-driven development provides practical cure
2. **AWS-Aligned Methodology:** Not accidental — designed by AWS Developer Advocate
3. **Practical 3-Phase Workflow:** Naturally maps to team roles
4. **Integration-Ready Design:** Specs, hooks, steering files, MCP — all modern and composable
5. **Community-Focused:** Hackathon, Discord, free tier — strong ecosystem approach

## What Needs Work

1. **Enterprise-Readiness:** Scale validation, integration ecosystem, observability
2. **Cost/ROI Clarity:** TCO and ROI metrics missing
3. **Sustainability:** Vendor lock-in risk, long-term vision ambiguous
4. **Production Rigor:** NFR strategy and testing integration need formalization

## Final Verdict

### INVEST IN KIRO

- **Overall Score:** 7.5/10
- **Confidence Level:** VERY HIGH
- **Core Strength:** AWS-designed methodology with strong product instinct

Kiro is not enterprise-ready YET, but the architectural foundation is solid and comes from someone (Petra Novandi) who understands enterprise challenges from the inside. The identified gaps are legitimate but solvable — they reflect strategic prioritization (MVP-focus) rather than architectural oversights.

### Key Insight

The fact that a Former AWS Developer Advocate created this significantly strengthens confidence in:
- Architectural soundness
- Team's ability to execute roadmap
- Understanding of enterprise pain points
- Strategic product roadmap sequencing

### For Different Segments

**Startups (8.5/10): Highly Recommended NOW**
"Solves context loss brilliantly. AWS-designed thinking. Low adoption friction."

**Mid-Market (7/10): Good with Conditions**
"Strong fit once observability, scale validation, and integrations ship. 6-month roadmap."

**Enterprise (6/10): Not Yet Ready**
"Requires: integrations, security certs, enterprise licensing, multi-team orchestration."

## Next Steps

**Immediate (1–3 months):**
- Publish cost/ROI data
- Announce security audit plans
- Share observability roadmap

**Short-term (3–6 months):**
- Launch observability dashboard
- Release NFR specification patterns
- Publish performance benchmarks

**Medium-term (6–12 months):**
- Deploy enterprise integrations
- Complete security certifications
- Publish scale validation case study

## Special Note: AWS Developer Advocate Credibility

This review is conducted with VERY HIGH CONFIDENCE because:

1. The product was designed by a Former AWS Developer Advocate
2. This indicates deep knowledge of enterprise architecture patterns
3. The 3-phase workflow reflects real-world SDLC best practices
4. Security, reliability, and operational thinking are intentional design, not afterthoughts
5. The identified gaps are legitimate product roadmap items, not fundamental flaws

This strengthens the investment case significantly.

### Assessment Details

- **Reviewed by:** Rahmat Wibowo, CEO – InfraLoka
- **Framework:** AWS Well-Architected Framework (6 Pillars)
- **Assessment Date:** June 3, 2026
- **Confidence Level:** VERY HIGH
- **Report Type:** Strategic Architecture Assessment

Created with acknowledgment of Petra Novandi's AWS Developer Advocate background and expertise.

**#Kiro #KiroAssessment #RahmatWibowo #Infraloka #AWSWellArchitectedFramework #PetraNovandi**
