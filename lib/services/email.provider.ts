export type WorkflowEmail = { to: string; subject: string; body: string }

export interface WorkflowEmailProvider {
  send(email: WorkflowEmail): Promise<void>
}

export function getWorkflowEmailProvider(): WorkflowEmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) return null

  return {
    async send(email) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.body }),
      })
      if (!response.ok) {
        throw new Error(`Resend request failed with status ${response.status}.`)
      }
    },
  }
}
