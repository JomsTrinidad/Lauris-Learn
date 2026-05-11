/**
 * iep-print.ts — DepEd-style IEP print renderer.
 *
 * printIEP() takes a typed IepPrintData snapshot and opens a browser print
 * dialog via a hidden iframe. All field values are HTML-escaped before
 * insertion. No React, no state — pure DOM operation.
 */

import { MEETING_PURPOSE_OPTIONS, TEAM_FOOTNOTE } from "./constants";
import type { GoalRow, InterventionRow } from "./steps/shared";
import type { IepTeamMember, IepAssistiveDevice, IepBarrier } from "./types";
import { esc } from "./iep-payload";

export interface IepPrintData {
  studentName: string;
  schoolName: string;
  schoolYearName: string | null;
  region: string;
  division: string;
  district: string;
  learnerLrn: string;
  learnerBirthDate: string;
  learnerSex: string;
  learnerGrade: string;
  religion: string;
  motherTongue: string;
  caregiverName: string;
  caregiverContact: string;
  caregiverEmail: string;
  homeAddress: string;
  parentWorkplace: string;
  diffSeeing: boolean;
  diffHearing: boolean;
  diffCommunicating: boolean;
  diffMoving: boolean;
  diffConcentrating: boolean;
  diffRemembering: boolean;
  diffOther: boolean;
  diffOtherDesc: string;
  hasMedical: boolean;
  medicalDiagnosis: string;
  meetingDate: string;
  meetingPurpose: string;
  lastIepDate: string;
  revisionDate: string;
  iepReviewDate: string;
  recommendations: string;
  agreements: string;
  evaluationResults: string;
  presentStrengths: string;
  presentNeeds: string;
  parentConcerns: string;
  disabilityImpact: string;
  teamMembers: IepTeamMember[];
  assistiveDevices: IepAssistiveDevice[];
  barriers: IepBarrier[];
  goals: GoalRow[];
  interventions: InterventionRow[];
  preparedBy: string;
  preparedDate: string;
  checkedReviewedBy: string;
  checkedReviewedDate: string;
}

/** Opens a browser print dialog with a DepEd-style IEP document. */
export function printIEP(data: IepPrintData): void {
  const {
    studentName, schoolName, schoolYearName,
    region, division, district,
    learnerLrn, learnerBirthDate, learnerSex, learnerGrade,
    religion, motherTongue,
    caregiverName, caregiverContact, caregiverEmail,
    homeAddress, parentWorkplace,
    diffSeeing, diffHearing, diffCommunicating, diffMoving,
    diffConcentrating, diffRemembering, diffOther, diffOtherDesc,
    hasMedical, medicalDiagnosis,
    meetingDate, meetingPurpose, lastIepDate, revisionDate, iepReviewDate,
    recommendations, agreements,
    evaluationResults, presentStrengths, presentNeeds, parentConcerns, disabilityImpact,
    teamMembers, assistiveDevices, barriers,
    goals, interventions,
    preparedBy, preparedDate, checkedReviewedBy, checkedReviewedDate,
  } = data;

  const purposeLabel =
    MEETING_PURPOSE_OPTIONS.find((o) => o.value === meetingPurpose)?.label ??
    meetingPurpose ??
    "—";

  const diffList = [
    diffSeeing && "Seeing",
    diffHearing && "Hearing",
    diffCommunicating && "Communicating",
    diffMoving && "Moving/Walking",
    diffConcentrating && "Concentrating/Paying Attention",
    diffRemembering && "Remembering/Understanding",
    diffOther && (diffOtherDesc || "Other"),
  ]
    .filter(Boolean)
    .join(", ");

  const goalsHtml = goals
    .map((g, i) => {
      const linked = interventions.filter((iv) => iv.goal_id === g.id);
      return `
        <div class="goal-block no-break">
          <table>
            <tr><th colspan="4">Annual Goal ${i + 1}: ${esc(g.description)}</th></tr>
            <tr>
              <td><b>Domain:</b> ${esc(g.domain ?? "—")}</td>
              <td><b>Target Date:</b> ${esc(g.target_date ?? "—")}</td>
              <td><b>Timeline:</b> ${esc(g.timeline ?? "—")}</td>
              <td><b>Responsible:</b> ${esc(g.responsible_person ?? "—")}</td>
            </tr>
            ${g.enroute_objectives ? `<tr><td colspan="4"><b>En Route Objectives:</b><br/>${esc(g.enroute_objectives)}</td></tr>` : ""}
            ${g.baseline ? `<tr><td colspan="2"><b>Baseline:</b> ${esc(g.baseline)}</td><td colspan="2"><b>Measurement:</b> ${esc(g.measurement_method ?? "—")}</td></tr>` : ""}
            ${g.success_criteria ? `<tr><td colspan="4"><b>Success Criteria:</b> ${esc(g.success_criteria)}</td></tr>` : ""}
          </table>
          ${
            linked.length
              ? `<table style="margin-top:4px">
              <tr><th>Intervention / Activity</th><th>Frequency / Session</th><th>Individual Responsible</th><th>Environment</th></tr>
              ${linked.map((iv) => `<tr><td>${esc(iv.strategy)}</td><td>${esc(iv.frequency ?? "—")}</td><td>${esc(iv.responsible_person ?? "—")}</td><td>${esc(iv.environment ?? "—")}</td></tr>`).join("")}
            </table>`
              : ""
          }
          ${g.remarks ? `<p style="font-size:9pt"><b>Remarks:</b> ${esc(g.remarks)}</p>` : ""}
        </div>`;
    })
    .join("");

  const teamHtml = teamMembers.length
    ? `<table>
        <tr><th>Name</th><th>Role</th><th>Signature / Acknowledgement</th></tr>
        ${teamMembers.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.role)}</td><td style="min-width:100px">&nbsp;</td></tr>`).join("")}
      </table>
      <p style="font-size:8pt;font-style:italic">${esc(TEAM_FOOTNOTE)}</p>`
    : "";

  const barriersHtml = barriers.length
    ? `<table>
        <tr><th>Difficulty</th><th>Learning Barriers</th><th>Learning Facilitators</th><th>Accommodations</th></tr>
        ${barriers.map((b) => `<tr><td>${esc(b.difficulty)}</td><td>${esc(b.learning_barriers)}</td><td>${esc(b.learning_facilitators)}</td><td>${esc(b.accommodations)}</td></tr>`).join("")}
      </table>`
    : "";

  const devicesHtml = assistiveDevices.length
    ? `<table>
        <tr><th>Difficulty</th><th>Assistive Technology / Devices</th></tr>
        ${assistiveDevices.map((d) => `<tr><td>${esc(d.difficulty)}</td><td>${esc(d.device)}</td></tr>`).join("")}
      </table>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IEP — ${esc(studentName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:10pt;color:#000;padding:16px}
    .center{text-align:center}
    h2{font-size:13pt;font-weight:bold;margin:8px 0 4px}
    .section-title{font-size:10pt;font-weight:bold;background:#ddd;border:1px solid #666;padding:3px 6px;margin:10px 0 4px}
    .field-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
    .field{flex:1;min-width:160px}
    .label{font-size:7.5pt;font-weight:bold;text-transform:uppercase;color:#555}
    .value{border-bottom:1px solid #999;min-height:16px;padding:1px 3px;font-size:9.5pt}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}
    th,td{border:1px solid #777;padding:3px 5px;font-size:9pt;vertical-align:top}
    th{background:#e8e8e8;font-weight:bold}
    .goal-block{margin-bottom:8px}
    .sig{display:flex;gap:20px;margin-top:14px}
    .sig-item{flex:1;text-align:center}
    .sig-line{border-top:1px solid #000;margin:20px 4px 2px}
    .sig-label{font-size:8pt}
    .no-break{page-break-inside:avoid}
    @page{size:A4;margin:14mm}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <div class="center">
    <div>Republic of the Philippines</div>
    <div>Department of Education</div>
    ${region ? `<div>${esc(region)}</div>` : ""}
    ${division ? `<div>${esc(division)}</div>` : ""}
    ${district ? `<div>${esc(district)}</div>` : ""}
    <h2>INDIVIDUALIZED EDUCATION PLAN (IEP)</h2>
    ${schoolName ? `<div>${esc(schoolName)}</div>` : ""}
    ${schoolYearName ? `<div>School Year: ${esc(schoolYearName)}</div>` : ""}
  </div>

  <div class="section-title">I. LEARNER INFORMATION</div>
  <div class="field-row">
    <div class="field"><div class="label">Learner Name</div><div class="value">${esc(studentName)}</div></div>
    <div class="field"><div class="label">LRN</div><div class="value">${esc(learnerLrn || "—")}</div></div>
    <div class="field"><div class="label">Date of Birth</div><div class="value">${esc(learnerBirthDate || "—")}</div></div>
    <div class="field"><div class="label">Sex</div><div class="value">${esc(learnerSex || "—")}</div></div>
  </div>
  <div class="field-row">
    <div class="field"><div class="label">Grade / Section</div><div class="value">${esc(learnerGrade || "—")}</div></div>
    <div class="field"><div class="label">Religion</div><div class="value">${esc(religion || "—")}</div></div>
    <div class="field"><div class="label">Mother Tongue</div><div class="value">${esc(motherTongue || "—")}</div></div>
  </div>
  <div class="field-row">
    <div class="field" style="flex:2"><div class="label">Parent / Guardian / Caregiver</div><div class="value">${esc(caregiverName || "—")}</div></div>
    <div class="field"><div class="label">Contact Number</div><div class="value">${esc(caregiverContact || "—")}</div></div>
    <div class="field"><div class="label">Email Address</div><div class="value">${esc(caregiverEmail || "—")}</div></div>
  </div>
  <div class="field-row">
    <div class="field" style="flex:2"><div class="label">Home Address</div><div class="value">${esc(homeAddress || "—")}</div></div>
    <div class="field"><div class="label">Workplace</div><div class="value">${esc(parentWorkplace || "—")}</div></div>
  </div>

  ${
    diffList || hasMedical || medicalDiagnosis
      ? `<div class="section-title">II. DIFFICULTIES / MEDICAL ASSESSMENT</div>
  ${diffList ? `<p><b>Reported Difficulties:</b> ${esc(diffList)}</p>` : ""}
  ${hasMedical ? `<p><b>With Medical Assessment/Diagnosis:</b> ${esc(medicalDiagnosis || "Yes (see attached)")}</p>` : ""}`
      : ""
  }

  <div class="section-title">III. MEETING INFORMATION</div>
  <div class="field-row">
    <div class="field"><div class="label">Date of Meeting</div><div class="value">${esc(meetingDate || "—")}</div></div>
    <div class="field"><div class="label">Date of Last IEP</div><div class="value">${esc(lastIepDate || "—")}</div></div>
    <div class="field"><div class="label">Purpose</div><div class="value">${esc(purposeLabel)}</div></div>
    ${meetingPurpose === "revision" ? `<div class="field"><div class="label">Revision Date</div><div class="value">${esc(revisionDate || "—")}</div></div>` : ""}
  </div>
  <div class="field-row">
    <div class="field"><div class="label">IEP Review Date</div><div class="value">${esc(iepReviewDate || "—")}</div></div>
  </div>
  ${recommendations ? `<p><b>Recommendations:</b> ${esc(recommendations)}</p>` : ""}
  ${agreements ? `<p><b>Agreements:</b> ${esc(agreements)}</p>` : ""}

  ${teamHtml ? `<div class="section-title">IV. IEP TEAM MEMBERS</div>${teamHtml}` : ""}

  ${
    evaluationResults || presentStrengths || presentNeeds || disabilityImpact
      ? `<div class="section-title">V. PRESENT LEVELS</div>
  ${evaluationResults ? `<p><b>Evaluation Results:</b> ${esc(evaluationResults)}</p>` : ""}
  ${presentStrengths ? `<p><b>Academic / Functional Strengths:</b> ${esc(presentStrengths)}</p>` : ""}
  ${presentNeeds ? `<p><b>Academic / Functional Needs:</b> ${esc(presentNeeds)}</p>` : ""}
  ${parentConcerns ? `<p><b>Parental Concerns:</b> ${esc(parentConcerns)}</p>` : ""}
  ${disabilityImpact ? `<p><b>Impact of Disability on Curriculum:</b> ${esc(disabilityImpact)}</p>` : ""}`
      : ""
  }

  ${devicesHtml ? `<div class="section-title">VI. ASSISTIVE DEVICES</div>${devicesHtml}` : ""}
  ${barriersHtml ? `<div class="section-title">VII. BARRIERS &amp; ACCOMMODATIONS</div>${barriersHtml}` : ""}

  <div class="section-title">VIII. LEARNER GOALS</div>
  ${goalsHtml || "<p><em>No goals recorded.</em></p>"}

  <div class="section-title">IX. PREPARED / REVIEWED</div>
  <div class="sig">
    <div class="sig-item">
      <div class="sig-line"></div>
      <div class="sig-label"><b>${esc(preparedBy || "Prepared By")}</b><br/>Special Education Teacher / SPED Teacher</div>
      ${preparedDate ? `<div class="sig-label">Date: ${esc(preparedDate)}</div>` : ""}
    </div>
    <div class="sig-item">
      <div class="sig-line"></div>
      <div class="sig-label"><b>${esc(checkedReviewedBy || "Checked and Reviewed By")}</b><br/>School Principal / Master Teacher</div>
      ${checkedReviewedDate ? `<div class="sig-label">Date: ${esc(checkedReviewedDate)}</div>` : ""}
    </div>
  </div>

</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);
  const iDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (iDoc) {
    iDoc.open();
    iDoc.write(html);
    iDoc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 600);
  }
}
