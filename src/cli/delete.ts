import type { TaskService } from '../tasks/task-service.js';

export async function deleteCommand(taskService: TaskService, taskId: string): Promise<void> {
  await taskService.deleteTask(taskId);
  console.log(`Task deleted: ${taskId}`);
}
