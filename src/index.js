const path = require('path')
const fs = require('fs')

const { resolvePath } = require('babel-plugin-module-resolver')
const findBabelConfig = require('find-babel-config')

// const rootPath = process.cwd()
let rootPath

function getFolderContents (folder, recursive) {
  return fs.readdirSync(folder).reduce(function (list, file) {
    const name = path.resolve(folder, file)
    const isDir = fs.statSync(name).isDirectory()

    return list.concat((isDir && recursive) ? getFolderContents(name, recursive) : [name])
  }, [])
}

const SEP = path.sep

function getContext(folder, recursive = false, pattern, parentDir, rootDir, lazy) {
  folder = path.normalize(folder)
  if (!parentDir) {
    parentDir = rootDir
  }

  let contextDir = path.join(rootPath, parentDir, folder)
  if(contextDir.slice(-1)==='/')
    contextDir = contextDir.slice(0, -1)
  const contextDirLen = contextDir.length + 1

  let normalizedFolder = parentDir ? path.resolve(parentDir, folder) : path.resolve(folder)

  const folderContents = getFolderContents(normalizedFolder, recursive)
    .filter(item => {
      return !pattern || pattern.test(item)
    })
    .map(requirePath => {
      const key = requirePath.slice(contextDirLen)
      return [ key , requirePath ]
    })
  
  const returnContext = `
    (function(){
      const map = Object.defineProperties({}, {
        `+folderContents.map(([key, requirePath])=>{
      requirePath = requirePath.slice(rootPath.length)
      if(requirePath.slice(0,1)==='/')
        requirePath = requirePath.slice(1)
      let accessor
      if(lazy){
        accessor = `
        get(){ return require("${requirePath}") },
      `
      }
      else{
        accessor = `
        value: require("${requirePath}"),
      `
      }
      return `
        "${key}": {
          ${accessor}
          enumerable: true,
        },
       `
      }).join('')+`
      })
      
      const returnContext = function(item){
        return map[item]
      }
      returnContext.keys = function(){
        return Object.keys(map)
      }
      return returnContext
    })()
  `

  return returnContext
}


function replaceWithSourceString(p, state, lazy){
  const [
    {value: dirname} = {},
    {value: recursive} = {},
    {value: regexp} = {},
    {value: parentDir} = {},
  ] = p.node.arguments

  const {
    file,
    opts = {},
  } = state

  const {
    alias = {},
  } = opts

  let dirpath = dirname

  const {config} = findBabelConfig.sync()
  
  //TODO require babel.config.js if exists
  
  const dirpathForResolvePath = dirpath==='.'?'./':dirpath
  if(config){
    const [ , resolvePathOpts = {} ] = config.plugins.find(plugin=>{
      return plugin instanceof Array && plugin[0]==='module-resolver'
    }) || []
    dirpath = resolvePath(dirpathForResolvePath, file.opts.filename, resolvePathOpts)
  }
  else{
    dirpath = resolvePath(dirpathForResolvePath, file.opts.filename)
  }

  const rootDir = path.dirname(file.opts.filename).slice(rootPath.length + 1)

  const str = getContext(dirpath, recursive, regexp, parentDir, rootDir, lazy)
  
  // console.log(str)
  // throw new Error('dev')

  p.replaceWithSourceString(str)
  p.addComment('leading',`!@compileDependencies(["`+dirpath+`/"])`)
}

module.exports = ({ types: t }) => {
  return {
    name: 'require-context-polyfill',
    pre: (state)=>{
      rootPath = state.opts.cwd
    },
    visitor: {
      CallExpression: (p, state) => {
        if (
          t.isMemberExpression(p.node.callee, { computed: false }) &&
          t.isIdentifier(p.get('callee').node.object, { name: 'require' })
        ) {
          if(t.isIdentifier(p.get('callee').node.property, { name: 'context' })){
            replaceWithSourceString(p, state)
          }
          if(t.isIdentifier(p.get('callee').node.property, { name: 'contextLazy' })){
            replaceWithSourceString(p, state, true)
          }
        }
      }
    },
  }
}
