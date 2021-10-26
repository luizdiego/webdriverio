import { waitForElementAndClick } from '../commands';
import { loadCredentialsFromEnv } from '../utils';
import { MAX_RETRIES_DEFAULT, MAX_RETRIES_DELAY_DEFAULT } from './constants';
const { cloneDeep } = require('lodash');
const { ensureFileSync, readFileSync, removeSync, writeFileSync } = require('fs-extra');
const { parseSync, transformFromAstSync } = require('@babel/core');
const { ConfigParser } = require('@wdio/config');

/**
 * Loads environemnt variables from './.env' file into process.env
 */
loadCredentialsFromEnv();

/**
 * Base webdriver.io configuration
 *
 * https://webdriver.io/docs/configurationfile/
 */
export const config = {
  runner: 'local',
  exclude: ['/node_modules/'],
  logLevel: 'warn',
  coloredLogs: true,
  bail: 0,
  specFileRetries: MAX_RETRIES_DEFAULT,
  specFileRetriesDelay: MAX_RETRIES_DELAY_DEFAULT,
  waitforTimeout: 60 * 1000, // 1 minute
  connectionRetryTimeout: 60 * 1000, // 1 minute
  chromeOptions: {
    prefs: {
      'profile.default_content_setting_values.geolocation': true,
    },
  },
  framework: 'mocha',
  mochaOpts: {
    timeout: 5 * 60 * 1000, // 5 minutes
  },
  before: () => {
    // Element commands
    browser.addCommand('waitForElementAndClick', waitForElementAndClick, true);
  },
  onPrepare: (config) => {
    const configParser = new ConfigParser();

    const specs = config.specs;
    const exclude = config.exclude;
    const currentSpecs = configParser.getSpecs(specs, exclude);

    config.originalSpecs = config.specs;
    config.specs = [];

    currentSpecs.forEach(spec => {
      const file = readFileSync(spec, 'utf8');
      const singleDescribe = file.match(/(describe\()/g).length === 1;

      if (singleDescribe) {
        const singleTest = parseSync(file);
        const describeIndex = findDescribeIndex(singleTest);
        const itIndexes = findItIndex(singleTest.program.body[describeIndex]);

        createSingleItFiles(singleTest, describeIndex, itIndexes, spec);
        itIndexes.forEach(currentItIndex => config.specs.push(`${spec}.${currentItIndex}.js`));
      } else {
        console.warn(`Failed for spec file ${spec} it contains multiple describes and can't be split`
        );
        config.specs.push(spec);
      }
    });
  },
  onComplete: (exitCode, config) => {
    config.specs.forEach(spec => removeSync(spec));
    config.specs = config.originalSpecs;
    delete config.originalSpecs;
  },
};

const isCallToDescribe = (node) =>
  node.type === 'ExpressionStatement'
  && node.expression.type === 'CallExpression'
  && node.expression.callee.type === 'Identifier'
  && node.expression.callee.name.toLowerCase() === 'describe';
const findDescribeIndex = (singleDescribe) =>
  singleDescribe.program.body.reduce((array, node, index) => isCallToDescribe(node) ? [...array, index] : array, []);

const isCallToIt = (node) =>
  node.type === 'ExpressionStatement'
  && node.expression.type === 'CallExpression'
  && node.expression.callee.type === 'Identifier'
  && node.expression.callee.name.toLowerCase() === 'it';
const findItIndex = (body) =>
  body.expression.arguments[1].body.body.reduce((array, node, index) => isCallToIt(node) ? [...array, index] : array, []);


const createSingleItFiles = (singleDescribe, describeIndex, itIndexes, spec) => {
  itIndexes.forEach((currentItIndex) => {
    const newSingleTest = cloneDeep(singleDescribe);
    const describe = newSingleTest.program.body[describeIndex];
    const describeArgs = describe.expression.arguments[1].body.body;
    describe.expression.arguments[1].body.body = describeArgs.filter((arg, index) => {
      return index === currentItIndex || !itIndexes.includes(index);
    });

    const newCode = transformFromAstSync(newSingleTest).code;
    ensureFileSync(`${spec}.${currentItIndex}.js`);
    writeFileSync(`${spec}.${currentItIndex}.js`, newCode);
  });
};
