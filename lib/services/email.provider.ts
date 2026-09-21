export type WorkflowEmail = { to: string; subject: string; body: string }

export interface WorkflowEmailProvider {
  send(email: WorkflowEmail): Promise<void>
}

export function getWorkflowEmailProvider(): WorkflowEmailProvider | null {
  return null
}
