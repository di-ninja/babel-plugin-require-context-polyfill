const path = require('path')
const fs = require('fs')

const { resolvePath } = require('babel-plugin-module-resolver')
const readBabelrcUp = require('read-babelrc-up')

const rootPath = process.cwd()

function getFolderContents (folder, recursive) {
  return fs.readdirSync(folder).reduce(function (list, file) {
    const name = path.resolve(folder, file)
    const isDir = fs.statSync(name).isDirectory()

    return list.concat((isDir && recursive) ? getFolderContents(name, recursive) : [name])
  }, [])
}

const SEP = path.sep

function getContext(folder, recursive = false, pattern, parentDir, rootDir) {
  folder = path.normalize(folder)
  if (!parentDir) {
    parentDir = rootDir
  }

  let contextDir = path.join(rootPath, parentDir, folder)
  if(contextDir.slice(-1)==='/')
    contextDir = contextDir.slice(0, -1)
  const contextDirLen = contextDir.length + 1

  let normalizedFolder = parentDir ? path.resolve(parentDir, folder) : path.resolve(folder)
  // if(normalizedFolder.slice(0, rootPath.length)!==rootPath)
    // normalizedFolder = path.join(rootPath, normalizedFolder)

  const folderContents = getFolderContents(normalizedFolder, recursive)
    .filter(item => {
      return !pattern || pattern.test(item)
    })
    .map(requirePath => {
      const key = requirePath.slice(contextDirLen)
      return [ key , requirePath ]
    })

  // console.log('folderContents',folderContents)

  const returnContext = `
    (function(){
      const map = {
      `+folderContents.map(([key, requirePath])=>{
        return "  '"+key+"': require('"+requirePath+"')"
      })+`
      }
      const returnContext = function(item){
        return map[item]
      }
      const keys = Object.keys(map)
      returnContext.keys = function(){
        return keys
      }
      return returnContext
    })()
  `

  return returnContext
}


module.exports = ({ types: t }) => {
  return {
    name: 'require-context-polyfill',
    visitor: {
      CallExpression: (p, state) => {
        if (
          t.isMemberExpression(p.node.callee, { computed: false }) &&
          t.isIdentifier(p.get('callee').node.object, { name: 'require' }) &&
          t.isIdentifier(p.get('callee').node.property, { name: 'context' })
        ) {

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

          const babelrc = readBabelrcUp.sync()
          
          const dirpathForResolvePath = dirpath==='.'?'./':dirpath
          if(babelrc && babelrc.babel){
            const [ , resolvePathOpts = {} ] = babelrc.babel.plugins.find(plugin=>{
              return plugin instanceof Array && plugin[0]==='module-resolver'
            }) || []
            dirpath = resolvePath(dirpathForResolvePath, file.opts.filename, resolvePathOpts)
          }
          else{
            dirpath = resolvePath(dirpathForResolvePath, file.opts.filename)
          }

          // console.log('dirpath',dirpath)
          // console.log('rootPath',rootPath)
          // console.log('file.opts.filename',file.opts.filename)
          // console.log('resolvePathOpts',resolvePathOpts)


          const rootDir = path.dirname(file.opts.filename).slice(rootPath.length + 1)
          // console.log('rootDir',rootDir)

          const str = getContext(dirpath, recursive, regexp, parentDir, rootDir)

          // console.log(str)
          // throw new Error('dev')

          p.replaceWithSourceString(str)

        }
      }
    }
  }
}
