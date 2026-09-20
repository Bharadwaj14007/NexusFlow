'use server'

import { ZodError } from 'zod'
import { isAppError } from '@/lib/errors'
import * as service from '@/lib/services/project-task.service'

function result(error: unknown) { if (error instanceof ZodError) return { error: error.issues[0]?.message ?? 'Invalid input.' }; if (isAppError(error)) return { error: error.message }; throw error }
function action(fn: (input: unknown) => Promise<unknown>) { return async (input: unknown) => { try { return { ok: true as const, data: await fn(input) } } catch (e) { return result(e) } } }
export const listProjectsAction = action(service.listProjects)
export const createProjectAction = action(service.createProject)
export const updateProjectAction = action(service.updateProject)
export const archiveProjectAction = action(service.archiveProject)
export const deleteProjectAction = action(service.deleteProject)
export const listTasksAction = action(service.listTasks)
export const createTaskAction = action(service.createTask)
export const updateTaskAction = action(service.updateTask)
export const duplicateTaskAction = action(service.duplicateTask)
export const deleteTaskAction = action(service.deleteTask)
export const archiveTaskAction = action(service.archiveTask)
export const addTaskDependencyAction = action(service.addTaskDependency)
export const removeTaskDependencyAction = action(service.removeTaskDependency)
export const addTaskCommentAction = action(service.addTaskComment)
export const updateTaskCommentAction = action(service.updateTaskComment)
export const deleteTaskCommentAction = action(service.deleteTaskComment)
export const createSubtaskAction = action(service.createSubtask)
export const completeSubtaskAction = action(service.completeSubtask)
export const deleteSubtaskAction = action(service.deleteSubtask)
export const listTaskActivityAction = action(service.listTaskActivity)
