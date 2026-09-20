import test from 'node:test';
import assert from 'node:assert/strict';
import { PortfolioController, StrategicPortfolioAllocator } from './portfolio.js';

test('allocator prefers risk-adjusted expected value instead of raw headline value', () => {
  const allocator=new StrategicPortfolioAllocator({explorationFraction:0,domainCap:1});
  const result=allocator.allocate([
    {id:'flashy',expectedValue:100,probability:0.2,risk:1,cost:10,strategicFit:0.5},
    {id:'solid',expectedValue:60,probability:0.9,risk:0.1,cost:10,strategicFit:0.9},
  ],{budget:10});
  assert.deepEqual(result.allocations.map(x=>x.id),['solid']);
});

test('allocator enforces domain concentration cap and preserves exploration capacity', () => {
  const allocator=new StrategicPortfolioAllocator({domainCap:0.5,explorationFraction:0.25});
  const result=allocator.allocate([
    {id:'a1',domain:'a',expectedValue:100,probability:1,cost:5,informationValue:0},
    {id:'a2',domain:'a',expectedValue:90,probability:1,cost:5,informationValue:0},
    {id:'b1',domain:'b',expectedValue:20,probability:0.5,cost:5,informationValue:1,samples:0},
  ],{budget:10});
  assert.ok(result.domainSpend.a<=5);
  assert.ok(result.allocations.some(x=>x.id==='b1'));
});

test('portfolio kills repeatedly failing paths and reallocates away from them', () => {
  const controller=new PortfolioController({allocator:new StrategicPortfolioAllocator({explorationFraction:0,domainCap:1}),killThreshold:0.34,minSamplesBeforeKill:3});
  controller.upsert({id:'bad',expectedValue:100,probability:0.9,cost:5,risk:0});
  controller.upsert({id:'good',expectedValue:50,probability:0.8,cost:5,risk:0});
  controller.recordOutcome('bad',{success:false});
  controller.recordOutcome('bad',{success:false});
  const killed=controller.recordOutcome('bad',{success:false});
  assert.equal(killed.status,'killed');
  const next=controller.rebalance({budget:5});
  assert.deepEqual(next.allocations.map(x=>x.id),['good']);
});
