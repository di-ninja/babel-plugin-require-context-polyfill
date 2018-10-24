const babel = require('@babel/core')
const plugin = require('../')

it('sould require dirA files', () => {
  const {code} = babel.transformFileSync('fixtures/testA.js', {plugins: [plugin]})
  expect(code).toMatchSnapshot()
})

it('sould require root project dirs', () => {
  const {code} = babel.transformFileSync('fixtures/testB.js', {plugins: [plugin]})
  expect(code).toMatchSnapshot()
})
