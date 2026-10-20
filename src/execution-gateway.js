'use strict';

const {
  openRuntimeDb,
  startTask,
  updateTask,
  startRun,
  updateRun,
  appendRunEvent
} = require('./runtime-store');
const fs = require('node:fs');
const path = require('node:path');
const { parseYamlFrontmatter, getInteractionLanguage } = require('./context');
const { createTranslator } = require('./i18n');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeAgentName(value) {
  const text = normalizeText(value).toLowerCase();
  return text ? (text.startsWith('@') ? text : `@${text}`) : '';
}

function classifyDirectAgentRuntime(agentName) {
  const normalized = normalizeAgentName(agentName);

  if (normalized === '@squad') {
    return {
      agentName: normalized,
      agentKind: 'squad',
      source: 'squad_session'
    };
  }

  if (normalized === '@workflow') {
    return {
      agentName: normalized,
      agentKind: 'workflow',
      source: 'workflow'
    };
  }

  if (normalized === '@orchestrator') {
    return {
      agentName: normalized,
      agentKind: 'official',
      source: 'orchestration'
    };
  }

  return {
    agentName: normalized,
    agentKind: 'official',
    source: 'direct'
  };
}

function makeWorkflowSessionKey(state) {
  const scope = state.featureSlug ? `feature:${state.featureSlug}` : 'project:default';
  return `workflow:${normalizeText(state.mode || 'project')}:${scope}`;
}

// Dashboard labels follow the project's interaction_language (LANGUAGE BOUNDARY).
function projectTranslator(targetDir) {
  try {
    const raw = fs.readFileSync(path.join(targetDir, '.aioson', 'context', 'project.context.md'), 'utf8');
    return createTranslator(getInteractionLanguage(parseYamlFrontmatter(raw).data, 'en')).t;
  } catch {
    return createTranslator('en').t;
  }
}

function makeWorkflowTaskTitle(state, t) {
  return state.featureSlug
    ? t('workflow_runtime.task_title_feature', { slug: state.featureSlug })
    : t('workflow_runtime.task_title_project');
}

function makeWorkflowTaskGoal(state, t) {
  return state.featureSlug
    ? t('workflow_runtime.task_goal_feature', { slug: state.featureSlug })
    : t('workflow_runtime.task_goal_project');
}

function makeWorkflowControllerTitle(state) {
  return state.featureSlug
    ? `Workflow controller (${state.featureSlug})`
    : 'Workflow controller';
}

function makeWorkflowStageTitle(agentName) {
  return `Workflow stage ${agentName}`;
}

function findTaskBySession(db, sessionKey) {
  return db
    .prepare(
      `
        SELECT task_key, status
        FROM tasks
        WHERE session_key = ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `
    )
    .get(sessionKey);
}

function findRunByTaskAndAgent(db, taskKey, agentName, options = {}) {
  const statuses = Array.isArray(options.statuses) && options.statuses.length > 0
    ? options.statuses
    : null;
  const workflowStage = options.workflowStage ? normalizeText(options.workflowStage) : null;

  let sql = `
    SELECT run_key, status
    FROM agent_runs
    WHERE task_key = ?
      AND agent_name = ?
  `;
  const params = [taskKey, agentName];

  if (workflowStage) {
    sql += ' AND workflow_stage = ?';
    params.push(workflowStage);
  }

  if (statuses) {
    sql += ` AND status IN (${statuses.map(() => '?').join(', ')})`;
    params.push(...statuses);
  }

  sql += ' ORDER BY updated_at DESC, started_at DESC LIMIT 1';
  return db.prepare(sql).get(...params);
}

async function ensureProjectRuntime(targetDir) {
  const handle = await openRuntimeDb(targetDir);
  try {
    return {
      runtimeDir: handle.runtimeDir,
      dbPath: handle.dbPath
    };
  } finally {
    handle.db.close();
  }
}

async function recordRuntimeOperation(targetDir, input) {
  const handle = await openRuntimeDb(targetDir);
  const { db, dbPath } = handle;

  try {
    const classification = classifyDirectAgentRuntime(input.agentName || 'orchestrator');
    const sessionKey = normalizeText(input.sessionKey) || `operation:${Date.now()}:${classification.agentName}`;
    const title = normalizeText(input.title) || `Runtime operation ${classification.agentName}`;
    const goal = normalizeText(input.goal) || `Registrar operacao ${classification.agentName}`;
    const phase = normalizeText(input.phase) || 'operation';
    const source = normalizeText(input.source) || classification.source;
    const finalStatus = normalizeText(input.status) || 'completed';
    const failure = finalStatus === 'failed';

    let task = findTaskBySession(db, sessionKey);
    if (!task) {
      task = {
        task_key: startTask(db, {
          sessionKey,
          title,
          goal,
          createdBy: classification.agentName,
          status: 'running'
        }),
        status: 'running'
      };
    } else {
      updateTask(db, { taskKey: task.task_key, status: 'running' });
    }

    const runTitle = normalizeText(input.runTitle) || normalizeText(input.commandName) || title;
    const startMessage = normalizeText(input.message) || `Operation started: ${runTitle}`;
    const summary = normalizeText(input.summary) || startMessage;
    const runKey = startRun(db, {
      taskKey: task.task_key,
      agentName: classification.agentName,
      agentKind: normalizeText(input.agentKind) || classification.agentKind,
      sessionKey,
      source,
      workflowId: normalizeText(input.workflowId) || null,
      workflowStage: normalizeText(input.workflowStage) || null,
      parentRunKey: normalizeText(input.parentRunKey) || null,
      title: runTitle,
      status: 'running',
      message: startMessage,
      payload: input.payload || null,
      phase
    });

    updateRun(db, {
      runKey,
      status: finalStatus,
      eventType: normalizeText(input.eventType) || (failure ? 'failed' : 'completed'),
      phase,
      source,
      workflowId: normalizeText(input.workflowId) || null,
      workflowStage: normalizeText(input.workflowStage) || null,
      parentRunKey: normalizeText(input.parentRunKey) || null,
      message: summary,
      summary,
      payload: input.payload || null,
      toolName: normalizeText(input.toolName) || null
    });

    updateTask(db, {
      taskKey: task.task_key,
      status: failure ? 'failed' : 'completed'
    });

    return {
      ok: true,
      dbPath,
      taskKey: task.task_key,
      runKey
    };
  } finally {
    db.close();
  }
}

async function syncWorkflowRuntime(targetDir, input) {
  const handle = await openRuntimeDb(targetDir);
  const { db, dbPath } = handle;

  try {
    const state = input.state || {};
    const eventPayload = input.eventPayload || {};
    if (!eventPayload.autonomy_mode && eventPayload.autonomyMode) {
      eventPayload.autonomy_mode = eventPayload.autonomyMode;
    }
    const activationAgent = normalizeText(input.activationAgent);
    const completedStage = normalizeText(input.completedStage);
    const sessionKey = makeWorkflowSessionKey(state);
    const workflowId = sessionKey;

    let task = findTaskBySession(db, sessionKey);
    if (!task) {
      const t = projectTranslator(targetDir);
      task = {
        task_key: startTask(db, {
          sessionKey,
          title: makeWorkflowTaskTitle(state, t),
          goal: makeWorkflowTaskGoal(state, t),
          createdBy: '@workflow',
          status: activationAgent ? 'running' : 'queued'
        }),
        status: activationAgent ? 'running' : 'queued'
      };
    }

    const taskKey = task.task_key;
    const controllerAgent = '@workflow';
    let controllerRun = findRunByTaskAndAgent(db, taskKey, controllerAgent, {
      statuses: ['queued', 'running']
    });

    if (!controllerRun) {
      controllerRun = {
        run_key: startRun(db, {
          taskKey,
          agentName: controllerAgent,
          agentKind: 'workflow',
          sessionKey,
          source: 'workflow',
          workflowId,
          workflowStage: activationAgent || completedStage || normalizeText(state.current || state.next),
          title: makeWorkflowControllerTitle(state),
          message: eventPayload.message || 'Workflow initialized'
        })
      };
    } else {
      appendRunEvent(db, {
        runKey: controllerRun.run_key,
        eventType: eventPayload.eventType || 'workflow',
        phase: 'workflow',
        status: activationAgent ? 'running' : 'queued',
        message: eventPayload.message || 'Workflow updated',
        payload: eventPayload
      });
    }

    if (controllerRun.run_key && eventPayload.eventType && eventPayload.eventType !== 'start' && eventPayload.eventType !== 'completed') {
      appendRunEvent(db, {
        runKey: controllerRun.run_key,
        eventType: eventPayload.eventType,
        phase: 'workflow',
        status: activationAgent ? 'running' : 'queued',
        message: eventPayload.message || 'Workflow updated',
        payload: eventPayload
      });
    }

    if (completedStage) {
      const completedAgent = normalizeAgentName(completedStage);
      let completedRun = findRunByTaskAndAgent(db, taskKey, completedAgent, {
        workflowStage: completedStage,
        statuses: ['queued', 'running']
      });

      if (!completedRun) {
        completedRun = {
          run_key: startRun(db, {
            taskKey,
            agentName: completedAgent,
            agentKind: 'official',
            sessionKey,
            source: 'workflow',
            workflowId,
            workflowStage: completedStage,
            parentRunKey: controllerRun.run_key,
            title: makeWorkflowStageTitle(completedAgent),
            message: `Stage ${completedAgent} restored for completion`
          })
        };
      }

      updateRun(db, {
        runKey: completedRun.run_key,
        status: 'completed',
        eventType: 'completed',
        phase: 'workflow',
        source: 'workflow',
        workflowId,
        workflowStage: completedStage,
        parentRunKey: controllerRun.run_key,
        message: `Workflow stage completed: ${completedAgent}`,
        summary: eventPayload.message || `Stage ${completedAgent} completed`,
        payload: eventPayload
      });
    }

    let stageRunKey = null;
    if (activationAgent) {
      const stageAgent = normalizeAgentName(activationAgent);
      let stageRun = findRunByTaskAndAgent(db, taskKey, stageAgent, {
        workflowStage: activationAgent,
        statuses: ['queued', 'running']
      });

      if (!stageRun) {
        stageRun = {
          run_key: startRun(db, {
            taskKey,
            agentName: stageAgent,
            agentKind: 'official',
            sessionKey,
            source: 'workflow',
            workflowId,
            workflowStage: activationAgent,
            parentRunKey: controllerRun.run_key,
            title: makeWorkflowStageTitle(stageAgent),
            message: eventPayload.message || `Workflow routed to ${stageAgent}`
          })
        };
      } else {
        appendRunEvent(db, {
          runKey: stageRun.run_key,
          eventType: eventPayload.eventType || 'workflow',
          phase: 'workflow',
          status: 'running',
          message: eventPayload.message || `Workflow stage active: ${stageAgent}`,
          payload: eventPayload
        });
      }

      stageRunKey = stageRun.run_key;
      if (eventPayload.eventType && eventPayload.eventType !== 'start' && eventPayload.eventType !== 'completed') {
        appendRunEvent(db, {
          runKey: stageRun.run_key,
          eventType: eventPayload.eventType,
          phase: 'workflow',
          status: 'running',
          message: eventPayload.message || `Workflow stage active: ${stageAgent}`,
          payload: eventPayload
        });
      }
      updateTask(db, { taskKey, status: 'running' });
    } else {
      updateRun(db, {
        runKey: controllerRun.run_key,
        status: 'completed',
        eventType: 'completed',
        phase: 'workflow',
        source: 'workflow',
        workflowId,
        workflowStage: normalizeText(state.current || state.next),
        message: eventPayload.message || 'Workflow completed',
        summary: eventPayload.message || 'Workflow completed',
        payload: eventPayload
      });
      updateTask(db, { taskKey, status: 'completed' });
    }

    return {
      ok: true,
      dbPath,
      taskKey,
      controllerRunKey: controllerRun.run_key,
      stageRunKey
    };
  } finally {
    db.close();
  }
}

async function bootstrapDirectAgentPrompt(targetDir, input) {
  const handle = await openRuntimeDb(targetDir);
  const { db, dbPath } = handle;

  try {
    const classification = classifyDirectAgentRuntime(input.agentName);
    const agentName = classification.agentName;
    const title = normalizeText(input.title) || `Direct handoff for ${agentName}`;
    const taskKey = startTask(db, {
      sessionKey: normalizeText(input.sessionKey) || `direct:${Date.now()}:${agentName}`,
      title,
      goal: normalizeText(input.goal) || `Entregar prompt e handoff para ${agentName}`,
      createdBy: '@runtime',
      status: 'queued'
    });

    const runKey = startRun(db, {
      taskKey,
      agentName,
      agentKind: normalizeText(input.agentKind) || classification.agentKind,
      sessionKey: normalizeText(input.sessionKey) || null,
      source: normalizeText(input.source) || classification.source,
      workflowId: null,
      workflowStage: null,
      title,
      status: 'queued',
      message: input.message || `Prompt generated for ${agentName}`,
      payload: input.payload || null,
      phase: 'handoff'
    });

    appendRunEvent(db, {
      runKey,
      eventType: 'prompt.generated',
      phase: 'handoff',
      status: 'queued',
      message: input.message || `Prompt generated for ${agentName}`,
      payload: {
        tool: input.tool || 'codex',
        locale: input.locale || 'en',
        instructionPath: input.instructionPath || null,
        prompt: input.prompt || null,
        requestedAgent: agentName
      }
    });

    return {
      ok: true,
      dbPath,
      taskKey,
      runKey
    };
  } finally {
    db.close();
  }
}

module.exports = {
  ensureProjectRuntime,
  syncWorkflowRuntime,
  makeWorkflowSessionKey,
  classifyDirectAgentRuntime,
  bootstrapDirectAgentPrompt,
  recordRuntimeOperation
};
