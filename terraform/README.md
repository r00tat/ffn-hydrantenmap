# hydrantenmap Infrastructure as Code

## Requirements

- Opentofu

```bash
# ensure direnv
direnv allow
# init
tofu init
# check changes
tofu plan -out tfplan
# apply
tofu apply tfplan
```

## Service Account Configuration

The application uses a service account for server-side operations including Gmail access, Google Sheets, Drive, and Vertex AI.

### IAM Roles

The service account needs the following IAM roles:

| Role | Purpose |
|------|---------|
| `roles/firebase.admin` | Firebase/Firestore access |
| `roles/aiplatform.user` | Vertex AI / Gemini model access |

```bash
# Add Vertex AI role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/aiplatform.user"
```

### Google Workspace Domain-Wide Delegation

For Gmail, Sheets, and Drive access via impersonation, configure domain-wide delegation in Google Workspace Admin Console:

1. Go to **Admin Console** → **Security** → **API Controls** → **Domain-wide Delegation**
2. Click **Add new**
3. Enter the service account **Client ID**
4. Add the following OAuth scopes:

```
https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/drive
```

| Scope | Purpose |
|-------|---------|
| `gmail.send` | Send Kostenersatz emails |
| `gmail.readonly` | Read Unwetter alarm emails |
| `gmail.modify` | Unstar processed emails |
| `spreadsheets.readonly` | Import data from Google Sheets |
| `drive` | Create Einsatz folders in Drive |

### Required APIs

Ensure these APIs are enabled in your Google Cloud project:

- `aiplatform.googleapis.com` - Vertex AI
- `firebasevertexai.googleapis.com` - Firebase Vertex AI
- `gmail.googleapis.com` - Gmail API
- `sheets.googleapis.com` - Sheets API
- `drive.googleapis.com` - Drive API

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT` | Service account JSON credentials |
| `EINSATZMAPPE_IMPERSONATION_ACCOUNT` | Email address to impersonate for Workspace APIs |
