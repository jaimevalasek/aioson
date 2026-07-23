'use strict';

const path = require('node:path');
const { validateProjectContextFile } = require('../context');
const {
  PROJECT_WORKFLOW_BY_CLASSIFICATION
} = require('../workflow-profile');

const WORKFLOW_BY_CLASSIFICATION = PROJECT_WORKFLOW_BY_CLASSIFICATION;

function normalizeClassification(value, fallback = 'MICRO') {
  const text = String(value || '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(WORKFLOW_BY_CLASSIFICATION, text)) return text;
  return fallback;
}

function withAgentPrefix(sequence) {
  return sequence.map((id) => `@${id}`);
}

function buildWorkflowPlan(input = {}) {
  const classification = normalizeClassification(input.classification, 'MICRO');
  const projectType = String(input.projectType || 'web_app');
  const frameworkInstalled = Boolean(input.frameworkInstalled);
  const sequence = WORKFLOW_BY_CLASSIFICATION[classification] || WORKFLOW_BY_CLASSIFICATION.MICRO;
  const noteKeys = [];

  if (!frameworkInstalled) {
    noteKeys.push('framework_not_installed');
  }
  if (projectType === 'dapp' || Boolean(input.web3Enabled)) {
    noteKeys.push('dapp_context');
  }
  if (classification === 'MICRO') {
    noteKeys.push('micro_scope');
  }
  noteKeys.push('feature_flow');

  return {
    classification,
    sequence,
    commands: withAgentPrefix(sequence),
    noteKeys
  };
}

async function runWorkflowPlan({ args, options = {}, logger, t }) {
  const targetDir = path.resolve(process.cwd(), args[0] || '.');
  const jsonMode = Boolean(options.json);
  const context = await validateProjectContextFile(targetDir);
  const contextData = context.parsed && context.data ? context.data : {};

  const plan = buildWorkflowPlan({
    classification: options.classification || contextData.classification || 'MICRO',
    projectType: contextData.project_type || options['project-type'] || 'web_app',
    frameworkInstalled:
      contextData.framework_installed !== undefined
        ? contextData.framework_installed
        : options['framework-installed'] === 'true',
    web3Enabled:
      contextData.web3_enabled !== undefined
        ? contextData.web3_enabled
        : options['web3-enabled'] === 'true'
  });

  const output = {
    ok: true,
    targetDir,
    contextExists: context.exists,
    contextParsed: context.parsed,
    classification: plan.classification,
    sequence: plan.sequence,
    commands: plan.commands,
    notes: plan.noteKeys.map((key) => t(`workflow_plan.note_${key}`)),
    noteKeys: plan.noteKeys
  };

  if (jsonMode) {
    return output;
  }

  if (!context.exists) {
    logger.log(t('workflow_plan.context_missing'));
  }
  logger.log(t('workflow_plan.title', { classification: plan.classification }));
  for (const command of plan.commands) {
    logger.log(t('workflow_plan.command_line', { command }));
  }
  if (output.notes.length > 0) {
    logger.log(t('workflow_plan.notes'));
    for (const note of output.notes) {
      logger.log(t('workflow_plan.note_line', { note }));
    }
  }

  return output;
}

module.exports = {
  runWorkflowPlan,
  normalizeClassification,
  buildWorkflowPlan,
  WORKFLOW_BY_CLASSIFICATION
};
