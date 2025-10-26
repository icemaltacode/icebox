type EmailLink = {
  label: string;
  href: string;
};

type EducatorEmailOptions = {
  courseDisplayName: string;
  courseCode: string;
  educatorName?: string;
  studentName?: string;
  studentId?: string;
  studentEmail?: string;
  completedAtIso: string;
  files: EmailLink[];
  comment?: string;
};

type StudentEmailOptions = {
  courseDisplayName: string;
  studentName?: string;
  completedAtIso: string;
  files: EmailLink[];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatTimestamp = (isoTimestamp: string) => {
  const date = new Date(isoTimestamp);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
};

const baseEmailStyles = `
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
  background-color: #1A1B1F;
  color: #FFFFFF;
  margin: 0;
  padding: 0;
`;

const containerStyles = `
  max-width: 560px;
  margin: 0 auto;
  background-color: #2D2E33;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #2F3035;
`;

const headerStyles = `
  background: linear-gradient(135deg, #00ADEF, #0099C2);
  padding: 24px 32px;
  color: #FFFFFF;
`;

const sectionStyles = `
  padding: 24px 32px;
  border-bottom: 1px solid #2F3035;
`;

const footerStyles = `
  padding: 16px 32px;
  color: #CCCCCC;
  font-size: 12px;
  background-color: #1A1B1F;
`;

const expiryNoteStyles = `
  margin-top: 16px;
  font-size: 12px;
  color: #888888;
`;

const linkListStyles = `
  list-style: none;
  margin: 16px 0 0 0;
  padding: 0;
`;

const linkItemStyles = `
  margin-bottom: 12px;
`;

const buttonLinkStyles = `
  display: inline-block;
  padding: 12px 16px;
  border-radius: 10px;
  background-color: #00ADEF;
  color: #1A1B1F;
  text-decoration: none;
  font-weight: 600;
`;

const detailLabelStyles = `
  color: #CCCCCC;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const detailValueStyles = `
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 600;
  margin: 4px 0 0 0;
`;

const renderFileLinks = (files: EmailLink[]) =>
  files
    .map(
      (file) => `
        <li style="${linkItemStyles}">
          <a href="${file.href}" style="${buttonLinkStyles}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(file.label)}
          </a>
        </li>
      `
    )
    .join('');

export const buildEducatorEmail = (options: EducatorEmailOptions) => {
  const {
    courseDisplayName,
    courseCode,
    educatorName,
    studentName,
    studentId,
    studentEmail,
    completedAtIso,
    files,
    comment
  } = options;

  const formattedTimestamp = formatTimestamp(completedAtIso);

  return {
    subject: `[${courseCode}] - Assignment Upload by ${escapeHtml(studentName ?? studentEmail ?? studentId ?? 'Student')}`,
    html: `
      <html>
        <body style="${baseEmailStyles}">
          <div style="padding: 24px;">
            <div style="${containerStyles}">
              <div style="${headerStyles}">
                <p style="margin: 0; font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85;">ICEBox</p>
                <h1 style="margin: 12px 0 0; font-size: 24px;">New student submission</h1>
                <p style="margin: 8px 0 0; font-size: 16px; opacity: 0.9;">${escapeHtml(courseDisplayName)}</p>
              </div>
              <div style="${sectionStyles}">
                <div style="margin-bottom: 20px;">
                  <p style="${detailLabelStyles}">Submitted by</p>
                  <p style="${detailValueStyles}">${studentName ? escapeHtml(studentName) : 'Not provided'}</p>
                  <p style="margin: 4px 0 0; color: #CCCCCC; font-size: 14px;">Email: ${studentEmail ? escapeHtml(studentEmail) : 'Not provided'}</p>
                  <p style="margin: 2px 0 0; color: #CCCCCC; font-size: 14px;">Student ID: ${studentId ?? 'Not provided'}</p>
                </div>
                <div>
                  <p style="${detailLabelStyles}">Submitted on</p>
                  <p style="${detailValueStyles}">${formattedTimestamp}</p>
                </div>
                ${
                  educatorName
                    ? `
                        <div style="margin-top: 20px;">
                          <p style="${detailLabelStyles}">Assigned educator</p>
                          <p style="${detailValueStyles}">${escapeHtml(educatorName)}</p>
                        </div>
                      `
                    : ''
                }
                ${
                  comment
                    ? `
                        <div style="margin-top: 20px;">
                          <p style="${detailLabelStyles}">Student notes</p>
                          <p style="margin: 6px 0 0; color: #CCCCCC; font-size: 14px; line-height: 1.6; white-space: pre-line;">${escapeHtml(comment)}</p>
                        </div>
                      `
                    : ''
                }
                <div style="margin-top: 24px;">
                  <p style="${detailLabelStyles}">Files</p>
                  <ul style="${linkListStyles}">
                    ${renderFileLinks(files)}
                  </ul>
                </div>
              </div>
              <div style="${footerStyles}">
                <p style="margin: 0;">Delivered by ICEBox — secure student submissions for ICE Campus.</p>
                <p style="${expiryNoteStyles}">Download links remain active for 28 days. Please save any files you need before they expire.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  };
};

export const buildStudentEmail = (options: StudentEmailOptions) => {
  const { courseDisplayName, studentName, completedAtIso, files } = options;
  const formattedTimestamp = formatTimestamp(completedAtIso);

  return {
    subject: `Assignment received — ${escapeHtml(courseDisplayName)}`,
    html: `
      <html>
        <body style="${baseEmailStyles}">
          <div style="padding: 24px;">
            <div style="${containerStyles}">
              <div style="${headerStyles}">
                <p style="margin: 0; font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85;">ICEBox</p>
                <h1 style="margin: 12px 0 0; font-size: 24px;">We received your files</h1>
                <p style="margin: 8px 0 0; font-size: 16px; opacity: 0.9;">${escapeHtml(courseDisplayName)}</p>
              </div>
              <div style="${sectionStyles}">
                <p style="margin: 0 0 16px; color: #FFFFFF; font-size: 16px; line-height: 1.6;">
                  ${studentName ? `Hi ${escapeHtml(studentName)},` : 'Hello,'}
                  <br />
                  Your files were uploaded successfully on ${formattedTimestamp}.
                </p>
                <p style="${detailLabelStyles}">Uploaded files</p>
                <ul style="${linkListStyles}">
                  ${renderFileLinks(files)}
                </ul>
                <p style="margin: 24px 0 0; color: #CCCCCC; font-size: 14px;">
                  You can revisit these links for the next 28 days. After that, your educator can access the files from ICEBox.
                </p>
              </div>
              <div style="${footerStyles}">
                <p style="margin: 0;">Delivered by ICEBox — secure student submissions for ICE Campus.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  };
};
