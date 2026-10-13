import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDeploy } from './deploy-api-guard.mjs';
const sha = 'a'.repeat(40);
const now = Date.parse('2026-10-13T12:00:00Z');
test('rejects invalid SHA and incomplete inputs', () => {
  assert.equal(assessDeploy({ targetSha: 'main', deploys: [], now }).allow, false);
  assert.equal(assessDeploy({ targetSha: sha, deploys: null, now }).allow, false);
});
test('skips same SHA already live', () => {
  assert.equal(assessDeploy({ targetSha: sha, deploys: [{id:'1',commit:{id:sha},status:'live',trigger:'new_commit'}],now }).reason,'already_live_or_in_progress');
});
test('skips duplicate API deploy inside 20 minutes', () => {
  assert.equal(assessDeploy({ targetSha: sha, deploys: [{id:'2',commit:{id:sha},status:'deactivated',trigger:'api',createdAt:'2026-10-13T11:50:00Z'}],now }).reason,'recent_api_deploy');
});
test('permits new SHA without matching deployments', () => {
  assert.equal(assessDeploy({ targetSha: sha, deploys: [{commit:{id:'b'.repeat(40)},status:'live'}],now }).allow,true);
});
test('does not count old API deployment as recent', () => {
  assert.equal(assessDeploy({ targetSha: sha, deploys: [{commit:{id:sha},status:'deactivated',trigger:'api',createdAt:'2026-10-13T11:00:00Z'}],now }).allow,true);
});
