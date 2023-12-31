Array.prototype.sortAsync = async function (comparator) {
 const promises = []
 const compareMap = new Map()
 const array = this
 for (const a of array) {
  for (const b of array) {
   promises.push(
    (async function () {
     if (!compareMap.has(a)) {
      compareMap.set(a, new Map())
     }
     compareMap.get(a).set(b, await comparator(a, b))
    })()
   )
  }
 }
 await Promise.all(promises)
 return array.sort(function (a, b) {
  return compareMap.get(a).get(b)
 })
}

Array.prototype.sortByProperty = function (propertyName) {
 return this.sort(function (a, b) {
  const aProp = a[propertyName]
  const bProp = b[propertyName]
  switch (typeof aProp) {
   case 'string':
    return aProp.localeCompare(bProp)
   case 'number':
    return aProp - bProp
   default:
    return 0
  }
 })
}

const civil = (globalThis.civil = {})

civil.arrayArgument =  Symbol('civil.arrayArgument')
civil.code =           Symbol('civil.code')
civil.initialState =   Symbol('civil.initialState')
civil.namedArguments = Symbol('civil.namedArguments')

civil.wordType = {
 NORMAL:  '0',
 LITERAL: '1',
 QUOTE:   '2',
 SPACE:   '3',
 ESCAPE:  '4',
}

civil.formatString = function (string) {
 return `'${string.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
}

civil.get = function (scope, initialTrace, _path, read = false) {
 if (_path.length === 0) {
  return undefined
 }
 const path = _path.slice(0)
 const firstSegment = path.shift()
 const realFirstSegment = civil.resolve(scope, firstSegment)
 let trace = read ? initialTrace[firstSegment] : realFirstSegment
 if (read && typeof trace === 'function' && !trace.name.startsWith('bound ')) {
  trace = trace.bind(initialTrace)
 }
 const indices = path.map((_, i) => i)
 forSegment: for (const segmentIndex of indices) {
  const segment = path[segmentIndex]
  const nextSegment = path[segmentIndex + 1]
  if (typeof trace === 'undefined' || trace === null) {
   throw new Error(`cannot read '${segment}' of ${trace}: '${_path.join(' ')}'`)
  }
  if (typeof trace === 'number') {
   switch (segment[0]) {
    case '-':
     trace = trace - civil.resolve(scope, segment.substring(1))
     continue forSegment
    case '+':
     trace = trace + civil.resolve(scope, segment.substring(1))
     continue forSegment
    case '*':
     trace = trace * civil.resolve(scope, segment.substring(1))
     continue forSegment
    case '/':
     trace = trace / civil.resolve(scope, segment.substring(1))
     continue forSegment
    case '%':
     trace = trace % civil.resolve(scope, segment.substring(1))
     continue forSegment
   }
  }
  const realSegment = civil.resolve(scope, segment)
  if (typeof realSegment !== 'string' && typeof realSegment !== 'number') {
   throw new Error(`'${segment}' does not resolve to a string or number, got ${typeof realSegment}`)
  }
  if (
   typeof trace[realSegment] === 'function' &&
   trace[realSegment] !== Array && 
   trace[realSegment] !== Date && 
   trace[realSegment] !== Object &&
   trace[realSegment] !== URL &&
   nextSegment !== 'name' &&
   !trace[realSegment].name.startsWith('bound ')
  ) {
   trace = trace[realSegment].bind(trace)
  } else {
   trace = trace[realSegment]
  }
 }
 return trace
}

civil.parse = function (source, exact) {
 const BREAK = '\n'
 const ESCAPE = '\\'
 const QUOTE = "'"
 const SPACE = ' '
 const code = []
 const line = []
 let word = ''
 const state = {
  inEscape: false,
  inString: false,
 }
 function pushWord(type, char) {
  if (word.length || state.inString) {
   const prefix = state.inString
    ? civil.wordType.LITERAL
    : civil.wordType.NORMAL
   line.push(prefix + word)
  }
  if (exact && type && char) {
   const lastWord = line[line.length - 1]
   const lastType = lastWord?.[0]
   if (lastType === type) {
    line[line.length - 1] = lastWord + char
   }
   else {
    line.push(type + char)
   }
  }
  word = ''
 }
 function pushLine(char) {
  pushWord(char)
  if (line.length > 0 || exact) {
   code.push(line.splice(0))
  }
 }
 for (let i = 0; i < source.length; i++) {
  const char = source[i]
  if (state.inEscape) {
   if (char === '\n') {
    if (exact) {
     pushWord(civil.wordType.SPACE , '\\\n')
    }
   }
   else if (exact) {
    word += ESCAPE + char
   }
   else {
    word += char === 'n' ? '\n' : ESCAPE + char
   }
   state.inEscape = false
  } else {
   switch (char) {
    case BREAK:
     if (state.inString) {
      word += char
     } else {
      pushLine(civil.wordType.SPACE, char)
     }
     break
    case ESCAPE:
     state.inEscape = true
     break
    case QUOTE:
     pushWord(civil.wordType.QUOTE, char)
     state.inString = !state.inString
     break
    case SPACE:
     if (state.inString) {
      word += char
     } else {
      pushWord(civil.wordType.SPACE, char)
     }
     break
    default:
     word += char
   }
  }
 }
 pushLine()
 return code
}

civil.resolve = function civilResolve(scope, token) {
 if (typeof token !== 'string') {
  throw new Error(`token must be a string, got ${typeof token}`)
 }
 const parsedInt = parseInt(token, 10)
 if (parsedInt.toString(10) === token) {
  return parsedInt
 }
 const parsedFloat = parseFloat(token)
 if (parsedFloat.toString() === token) {
  return parsedFloat
 }
 const ESCAPE = '\\'
 const SPACE = ' '
 const VARIABLE = '$'
 const parts = []
 const partVariables = []
 let part = ''
 let isVariable = false
 let isInEscape = false
 function pushPart() {
  if (isVariable || part.length > 0) {
   parts.push(part)
   partVariables.push(isVariable)
  }
  part = ''
  isVariable = false
 }
 for (let i = 0; i < token.length; i++) {
  const char = token[i]
  if (isInEscape) {
   isInEscape = false
   part += char
  } else {
   switch (char) {
    case ESCAPE:
     isInEscape = true
     break
    case SPACE:
     if (isVariable) {
      pushPart()
      isVariable = false
     } else {
      part += char
     }
     break
    case VARIABLE:
     pushPart()
     isVariable = true
     break
    default:
     part += char
   }
  }
 }
 pushPart()
 function compoundGet(first, ...rest) {
  const value = scope[first]
  if (rest.length > 0 && (typeof value === 'undefined' || value === null)) {
   throw new Error(`Cannot read property '${rest.join(' ')}' of ${first} because it is ${value}`)
  }
  return rest.length > 0 ? civil.get(scope, value, rest, true) : value
 }
 if (parts.length === 1) {
  return partVariables[0] ? compoundGet(...parts[0].split(' ')) : parts[0]
 }
 return parts.map((part, i) => (partVariables[i] ? compoundGet(...part.split(' ')) : part)).join('')
}

civil.set = function civilSet(scope, value, _path) {
 const path = _path.slice(0)
 const lastSegment = path.pop()
 let trace = scope
 for (const segment of path) {
  if (typeof trace === 'undefined' || trace === null) {
   throw new Error(`cannot read '${segment}' of ${trace}`)
  }
  const realSegment = civil.resolve(scope, segment)
  if (typeof realSegment !== 'string' && typeof realSegment !== 'number') {
   throw new Error(`'${segment}' does not resolve to a string or number, got ${typeof realSegment}`)
  }
  trace = trace[realSegment]
 }
 if (typeof trace === 'undefined' || trace === null) {
  throw new Error(`cannot set '${lastSegment}' of ${trace}`)
 }
 const realLastSegment = civil.resolve(scope, lastSegment)
 if (typeof realLastSegment !== 'string' && typeof realLastSegment !== 'number') {
  throw new Error(
   `'${lastSegment}' does not resolve to a string or number, got ${typeof realLastSegment}`
  )
 }
 trace[realLastSegment] = value
}

civil.scope = function civilScope(scope) {
 const me = {
  async apply(_word) {
   const type = _word[0]
   const word = _word.substring(1)
   // console.log(type, word)
   if (type === civil.wordType.NORMAL &&
    !me.state.capture && (civil.states.hasOwnProperty(word) || me.data.isAtBreak)
   ) {
    if (me.state.complete) {
     await me.state.complete(me, scope)
    }
    let stateChange = false
    if (civil.states.hasOwnProperty(word)) {
     stateChange = true
     me.state = civil.states[word]
    }
    if (me.data.isAtBreak) {
     me.lineState = me.state
     if (me.previousLineState !== me.state) {
      await me.end()
     }
     me.data.isAtBreak = false
    }
    if (me.state.begin) {
     await me.state.begin(me, scope)
    }
    if (stateChange) {
     if (me.state.immediate) {
      await me.state.complete(me, scope)
      me.state = civil.states[civil.initialState]
     }
    } else {
     await me.state.apply(me, scope, word, _word)
    }
   } else if (me.state.apply) {
    await me.state.apply(me, scope, word, _word)
   }
  },
  async break() {
   if (me.state.complete) {
    await me.state.complete(me, scope)
   }
   me.previousLineState = me.lineState
   me.data.isAtBreak = true
   me.state = me.lineState = civil.states[civil.initialState]
   // console.log('break')
  },
  data: {
   isAtBreak: true,
  },
  async end() {
   if (me.previousLineState?.completeLines) {
    await me.previousLineState.completeLines(me, scope)
   }
  },
  clone() {
   return civil.scope(scope)
  },
  async run(arg) {
   if (typeof arg === 'undefined') {
    return me
   }
   // console.log('start run', JSON.stringify(arg, null, 2))
   me.state = civil.states[civil.initialState]
   await me.state.begin(me)
   if (typeof arg === 'string') {
    return me.run(civil.parse(arg))
   } else if (Array.isArray(arg)) {
    if (arg.length > 0) {
     if (typeof arg[0] === 'string') {
      return me.run(arg[0])
     } else {
      for (let lineI = 0; lineI < arg.length; lineI++) {
       const lineWords = arg[lineI].slice()
       let deltaWord = 0
       if (me.data.error) {
        if (lineWords[0] === '0!!') {
         lineWords.shift()
         const errorName = lineWords.shift().substring(1)
         if (typeof errorName !== 'string') {
          throw new Error(
           `Expecting identifier after !! on line ${lineI} word 1 of (code) ${arg[lineI].join(' ')}`
          )
         }
         civil.set(scope, me.data.error, [errorName])
         me.data.error = undefined
         deltaWord += 2
         me.state = me.lineState = civil.states[civil.initialState]
        } else {
         continue
        }
       } else if (arg[lineI][0] === '0!!') {
        continue
       }
       for (let wordI = 0; wordI < lineWords.length; wordI++) {
        if (me.data.error) {
         break
        }
        const word = lineWords[wordI]
        if (word === '0!debug' && !me.data.recording) {
         debugger
        } else {
         try {
          await me.apply(word)
          me.data.lastWord = word
         } catch (e) {
          console.warn(
           `Error at '${word}' on line ${lineI} word ${wordI + deltaWord} of (code) ${arg[
            lineI
           ].join(' ')}`
          )
          console.error(e)
          me.data.error = e
         }
        }
       }
       if (me.data.error) {
        continue
       }
       try {
        await me.break()
          me.data.lastWord = undefined
       } catch (e) {
        console.warn(`Error at end of line ${lineI} (code) ${arg[lineI].join(' ')}`)
        console.error(e)
        me.data.error = e
       }
      }
      if (!me.data.error && me.lineState?.completeLines) {
       try {
        await me.lineState.completeLines(me, scope)
       } catch (e) {
        console.warn('Error at end')
        console.error(e)
        me.data.error = e
       }
      }
      // console.log('finished run', { code: arg }, me)
      if (me.data.error) {
       me.data.error = undefined
       throw me.data.error
      }
      return me.data.focus
     }
    }
   } else {
    throw new Error(`invalid argument run(${typeof arg})`)
   }
  },
  async thread(arg) {
   return civil.scope(scope).run(arg)
  },
 }
 return me
}

civil.states = {
 [civil.initialState]: {
  '': 'initial',
  apply(me, scope, word) {
   me.data.pendingHand.push(word)
  },
  begin(me, scope) {
   me.data.hand = []
   me.data.pendingHand = []
  },
  complete(me, scope) {
   if (me.data.pendingHand.length > 0 || me.data.lastWord === '0,') {
    const handCopy = me.data.pendingHand.splice(0)
    if (typeof handCopy[0] === 'object') {
     const context = handCopy.shift()
     me.data.hand.push(
      civil.get(scope, context, handCopy, true)
     )
    }
    else {
     me.data.hand.push(
      civil.get(scope, scope, handCopy)
     )
    }
   }
  },
  completeLines(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand.shift()
   }
  },
 },

 '.': {
  title: 'Pick up result (access property of focus)\nUsage: <code>$some-function ! . path to property',
  '': '.',
  complete(me, scope) {
   me.data.pendingHand.push(me.data.focus)
  },
  immediate: true,
 },

 '&': {
  title: 'Stack arguments\nUsage: <code>arg1 & arg2 & arg3 @ some-function !',
  '': '&',
  apply(me, scope, word) {
   me.data.arrayArgumentPath.push(word)
  },
  begin(me, scope) {
   const latestHand = me.data.hand[me.data.hand.length - 1]
   if (Array.isArray(latestHand) && existingStack[civil.arrayArgument]) {
    me.data.arrayArgument = latestHand
   }
   else {
    me.data.arrayArgument = [ latestHand ]
    me.data.arrayArgument[civil.arrayArgument] = true
    me.data.hand[me.data.hand.length - 1] = me.data.arrayArgument
   }
   me.data.arrayArgumentPath = []
  },
  complete(me, scope) {
   me.data.arrayArgument.push(
    civil.get(scope, scope, me.data.arrayArgumentPath)
   )
  },
 },

 ',,': {
  title: 'Spread stacked arguments\nUsage: <code>foo , $stack ,, , bar @ some-function !',
  '': ',,',
  complete(me, scope) {
   const latestHand = me.data.hand[me.data.hand.length - 1]
   if (Array.isArray(latestHand) && latestHand[civil.arrayArgument]) {
    me.data.hand.splice(me.data.hand.length - 1, 1, ...latestHand)
   }
  },
  immediate: true,
 },

 ',': {
  title: 'Queue argument for binding\nUsage: <code>arg1 , arg2 @ some-function !',
  '': ',',
  complete(me, scope) {
   if (me.data.hand.length === 0) {
    me.data.hand.push(me.data.focus)
   }
  },
  immediate: true,
 },

 '~': {
  title: 'Boolean not\nUsage: <code>$foo ~',
  '': '~',
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   if (hand.length > 0) {
    me.data.focus = me.data.value = !hand.some((x) => x)
   }
   else {
    me.data.focus = !me.data.focus
   }
  },
  immediate: true,
 },

 '?': {
  title: 'Conditionally evaluate recording\nUsage:\n<code>.. $-- some-function !\n$condition ?',
  '': '?',
  async complete(me, scope) {
   if (!Array.isArray(me.data.focus)) {
    if (!me.data.lastRecording) {
     throw new Error(`? may only be used after a recording, got ${typeof me.data.focus}`)
    }
    const code = me.data.lastRecording.slice(0)
    const condition = function condition() {
     const newScope = { '--': scope }
     return civil.scope(newScope).run(code)
    }
    if (me.data.focus) {
     me.data.focus = await condition()
    } else {
     me.data.focus = undefined
    }
    return
   }
   const code = me.data.focus.splice(0)
   me.data.focus = function condition() {
    const newScope = { '--': scope }
    return civil.scope(newScope).run(code)
   }
   const hand = me.data.hand.splice(0)
   if (hand.length > 0) {
    if (hand.some((x) => x)) {
     me.data.focus = await me.data.focus()
     return
    }
   } else if (me.data.value) {
    me.data.focus = await me.data.focus()
    return
   }
   me.data.focus = undefined
  },
  immediate: true,
 },

 '@': {
  title: 'Bind queued arguments to function at path\nUsage: <code>arg1 , arg2 @ some-function !',
  '': '@',
  apply(me, scope, word) {
   me.data.functionPath.push(word)
  },
  begin(me, scope) {
   me.data.functionPath = []
  },
  complete(me, scope) {
   const functionPath = me.data.functionPath.splice(0)
   const func = civil.get(scope, scope, functionPath, true)
   if (typeof func !== 'function') {
    throw new Error(
     `@ expects '${functionPath.join(' ')}' to resolve to a function, got ${typeof func}`
    )
   }
   const hand = me.data.hand.splice(0)
   if (hand.length === 0) {
    me.data.focus = func.bind(undefined, me.data.focus)
   } else {
    me.data.focus = func.bind(undefined, ...hand)
   }
  },
 },

 '!': {
  title: 'Run function immediately\nUsage: <code>$some-function !',
  '': '!',
  async complete(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand.shift()
    if (typeof me.data.focus !== 'function') {
     throw new Error(
      `! may only be used after a function, got ${typeof me.data.focus} at '${me.data.functionPath ? me.data.functionPath.join(
       ' '
      ) : 'unknown'}'`
     )
    }
   }
   if (typeof me.data.focus !== 'function') {
    throw new Error(`! may only be used after a function, got ${typeof me.data.focus}`)
   }
   const hand = me.data.hand.splice(0)
   me.data.focus = await me.data.focus(...hand)
  },
  immediate: true,
 },

 '!-': {
  title: 'Run function immediately, returning but not waiting for any returned promise\nUsage: <code>$some-function !-',
  '': '!-',
  async complete(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand.shift()
    if (typeof me.data.focus !== 'function') {
     throw new Error(
      `!- may only be used after a function, got ${typeof me.data.focus} at '${me.data.functionPath ? me.data.functionPath.join(
       ' '
      ) : 'unknown'}'`
     )
    }
   }
   if (typeof me.data.focus !== 'function') {
    throw new Error(`!- may only be used after a function, got ${typeof me.data.focus}`)
   }
   const hand = me.data.hand.splice(0)
   me.data.focus = me.data.focus(...hand)
  },
  immediate: true,
 },

 '!~': {
  title: 'Run function immediately, discarding any returned promise\nUsage: <code>$some-function !~',
  '': '!~',
  async complete(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand.shift()
    if (typeof me.data.focus !== 'function') {
     throw new Error(
      `!~ may only be used after a function, got ${typeof me.data.focus} at '${me.data.functionPath ? me.data.functionPath.join(
       ' '
      ) : 'unknown'}'`
     )
    }
   }
   if (typeof me.data.focus !== 'function') {
    throw new Error(`!~ may only be used after a function, got ${typeof me.data.focus}`)
   }
   const hand = me.data.hand.splice(0)
   me.data.focus(...hand)
   me.data.focus = undefined
  },
  immediate: true,
 },

 '!new': {
  title: 'Create new class instance (not recommended)\nUsage: <code>$Date !new',
  '': '!new',
  async complete(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand.shift()
    if (typeof me.data.focus !== 'function') {
     throw new Error(
      `! may only be used after a function, got ${typeof me.data.focus} at '${me.data.functionPath ? me.data.functionPath.join(
       ' '
      ) : 'unknown'}'`
     )
    }
   }
   if (typeof me.data.focus !== 'function') {
    throw new Error(`! may only be used after a function, got ${typeof me.data.focus}`)
   }
   const hand = me.data.hand.splice(0)
   me.data.focus = await new me.data.focus(...hand)
  },
  immediate: true,
 },

 '#': {
  title: 'Comment\nUsage: <code># this is a comment',
  '': '#',
  capture: true,
 },

 '..': {
  title: 'Record code for later use\nUsage: <code>.. $-- some-function !',
  '': '..',
  apply(me, scope, word, wordRaw) {
   me.data.recordingLine.push(wordRaw)
  },
  begin(me, scope) {
   if (!me.data.recording) {
    me.data.recording = []
   }
   if (!me.data.recordingLine) {
    me.data.recordingLine = []
   }
  },
  capture: true,
  complete(me, scope) {
   me.data.recording.push(me.data.recordingLine.splice(0))
  },
  completeLines(me, scope) {
   me.data.focus = me.data.lastRecording = me.data.recording.splice(0)
   // console.log('finish recording', me.data.focus.slice())
  },
 },

 '<<': {
  title: 'Convert recording to function with named arguments\nUsage: <code>.. $first , $last @ -- console log !\n<< first last',
  '': '<<',
  apply(me, scope, word) {
   me.data.argumentNames.push(word)
  },
  begin(me, scope) {
   me.data.argumentNames = []
  },
  complete(me, scope) {
   if (!Array.isArray(me.data.focus)) {
    throw new Error(`<< may only be used after a recording, got ${typeof me.data.focus}`)
   }
   const code = me.data.focus.splice(0)
   const argumentNames = me.data.argumentNames.splice(0)
   me.data.focus = function namedArguments(...args) {
    if (args[0] === civil.namedArguments) {
     return argumentNames.slice()
    } else if (args[0] === civil.code) {
     return code.slice()
    }
    const newScope = { '--': scope }
    for (let i = 0; i < argumentNames.length; i++) {
     newScope[argumentNames[i]] = args[i]
    }
    return civil.scope(newScope).run(code)
   }
  },
 },

 '>>': {
  title: 'Store value into variable or property\nUsage: <code>#808080 >> body style backgroundColor',
  '': '>>',
  apply(me, scope, word) {
   me.data.destinationPath.push(word)
  },
  begin(me, scope) {
   me.data.destinationPath = []
  },
  complete(me, scope) {
   const value = me.data.hand.length > 0
    ? me.data.hand.shift() 
    : me.data.focus
   civil.set(scope, value, me.data.destinationPath.splice(0))
   me.data.focus = value
  },
 },

 '@>': {
  title: 'Bind recording with context to function\nUsage: <code>.. #808080 >> backgroundColor\n.. pointer >> cursor\n@> body style !',
  '': '@>',
  apply(me, scope, word) {
   me.data.scopeName.push(word)
  },
  begin(me, scope) {
   me.data.scopeName = []
  },
  complete(me, scope) {
   if (!Array.isArray(me.data.focus)) {
    throw new Error(`@> may only be used after a recording, got ${typeof me.data.focus}`)
   }
   const code = me.data.focus.splice(0)
   const scopeName = me.data.scopeName.splice(0)
   me.data.focus = function namedArguments(arg) {
    if (arg === civil.namedArguments) {
     return []
    } else if (arg === civil.code) {
     return code.slice()
    }
    const newScope = civil.get(scope, scope, scopeName, true)
    if (typeof newScope !== 'object' || newScope === null) {
     throw new Error(
      `@> expects an object at '${scopeName.join(' ')}', got ${newScope === null ? 'null' : typeof newScope}`
     )
    }
    newScope['--'] = scope // todo: not a great long-term solution
    return civil.scope(newScope).run(code)
   }
  },
 },

 ':': {
  title: 'Bind function to map over each word\nUsage: <code>.. $word @ -- console log !\n<< word : foo bar !',
  '': ':',
  apply(me, scope, word) {
   me.data.applyMultiple.push(word)
  },
  begin(me, scope) {
   if (typeof me.data.focus !== 'function') {
    throw new Error(`focus must be a function, got ${typeof me.data.focus}`)
   }
   me.data.applyMultiple = []
  },
  async complete(me, scope) {
   if (typeof me.data.focus !== 'function') {
    throw new Error(`focus must be a function, got ${typeof me.data.focus}`)
   }
   const func = me.data.focus
   const applyMultiple = me.data.applyMultiple.splice(0)
    .map(word => civil.resolve(scope, word))
   me.data.focus = async function () {
    await Promise.all(applyMultiple.map((word) => func(word)))
   }
  },
 },

 '::': {
  title: 'Bind function to map over array\nUsage: <code>.. $item @ -- console log !\n<< item :: items !',
  '': '::',
  apply(me, scope, word) {
   me.data.applyPath.push(word)
  },
  begin(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand[0]
    me.data.hand.length = 0
   }
   if (typeof me.data.focus !== 'function') {
    throw new Error(`focus must be a function, got ${typeof me.data.focus}`)
   }
   me.data.applyPath = []
  },
  async complete(me, scope) {
   if (typeof me.data.focus !== 'function') {
    throw new Error(`focus must be a function, got ${typeof me.data.focus}`)
   }
   const func = me.data.focus
   const applyPath = me.data.applyPath.splice(0)
   const value = civil.get(scope, scope, applyPath, true)
   if (typeof value === 'number') {
    const output = []
    if (value < 0) {
     me.data.focus = async function () {
      for (let i = 0; i > value; i--) {
       output.push(await func(i))
      }
      return output
     }
    }
    else {
     me.data.focus = async function () {
      for (let i = 0; i < value; i++) {
       output.push(await func(i))
      }
      return output
     }
    }
   }
   else {
    if (!Array.isArray(value)) {
     throw new Error(`:: was expecting '${applyPath.join(' ')}' to be an Array, got ${typeof value}`)
    }
    const output = []
    me.data.focus = async function () {
     for (let i = 0; i < value.length; i++) {
      output.push(await func(value[i], i))
     }
     return output
    }
   }
  },
 },

 ':::': {
  title: 'Optimized loop (work in progress, still slow)\nUsage: <code>.. $i @ -- console log !\n::: i 0 10',
  '': ':::',
  apply(me, scope, word) {
   me.data.fastRange.push(word)
  },
  begin(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand[0]
    me.data.hand.length = 0
   }
   me.data.fastRange = []
  },
  async complete(me, scope) {
   const recording = me.data.focus
   if (!Array.isArray(recording)) {
    throw new Error('::: must immediately follow a recording')
   }
   const [ variableName , _start , _end ] = me.data.fastRange
   const start = civil.get(scope, scope, _start.split(' '))
   const end = civil.get(scope, scope, _end.split(' '))
   me.data.focus = async function () {
    for (let i = start ; i <= end ; i++) {
     scope[variableName] = i
     await me.run(recording)
    }
   }
  },
 },

 '::::::': {
  title: 'Optimized double loop (work in progress, still slow)\nUsage: <code>.. $i , $j @ -- console log !\n:::::: i 0 10 j 0 10',
  '': '::::::',
  apply(me, scope, word) {
   me.data.fastRange.push(word)
  },
  begin(me, scope) {
   if (me.data.hand.length > 0) {
    me.data.focus = me.data.hand[0]
    me.data.hand.length = 0
   }
   me.data.fastRange = []
  },
  async complete(me, scope) {
   const recording = me.data.focus
   if (!Array.isArray(recording)) {
    throw new Error(':::::: must immediately follow a recording')
   }
   const [ variableName1 , _start1 , _end1,
           variableName2 , _start2 , _end2 ] = me.data.fastRange
   const start1 = civil.get(scope, scope, _start1.split(' '))
   const end1 = civil.get(scope, scope, _end1.split(' '))
   const start2 = civil.get(scope, scope, _start2.split(' '))
   const end2 = civil.get(scope, scope, _end2.split(' '))
   me.data.focus = async function () {
    for (let i = start1 ; i <= end1 ; i++) {
     scope[variableName1] = i
     for (let j = start2 ; j <= end2 ; j++) {
      scope[variableName2] = j
      await me.run(recording)
     }
    }
   }
  },
 },

 '~=': {
  title: 'Not equal to\nUsage: <code>4 ~= 3',
  '': '~=',
  apply(me, scope, word) {
   me.data.compareToPath.push(word)
  },
  begin(me, scope) {
   me.data.compareToPath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const compareToPath = me.data.compareToPath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const compareToValue = civil.get(scope, scope, compareToPath)
   me.data.focus = hand.some((handValue) => handValue !== compareToValue)
  },
 },

 '=': {
  title: 'Equal to\nUsage: <code>4 = 4',
  '': '=',
  apply(me, scope, word) {
   me.data.compareToPath.push(word)
  },
  begin(me, scope) {
   me.data.compareToPath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const compareToPath = me.data.compareToPath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const compareToValue = civil.get(scope, scope, compareToPath)
   me.data.focus = hand.some((handValue) => handValue === compareToValue)
  },
 },

 '<': {
  title: 'Less than\nUsage: <code>3 < 4',
  '': '<',
  apply(me, scope, word) {
   me.data.compareToPath.push(word)
  },
  begin(me, scope) {
   me.data.compareToPath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const compareToPath = me.data.compareToPath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const compareToValue = civil.get(scope, scope, compareToPath)
   me.data.focus = hand.some((handValue) => handValue < compareToValue)
  },
 },

 '>': {
  title: 'Greater than\nUsage: <code>4 > 3',
  '': '>',
  apply(me, scope, word) {
   me.data.compareToPath.push(word)
  },
  begin(me, scope) {
   me.data.compareToPath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const compareToPath = me.data.compareToPath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const compareToValue = civil.get(scope, scope, compareToPath)
   me.data.focus = hand.some((handValue) => handValue > compareToValue)
  },
 },

 '<=': {
  title: 'Less than or equal to\nUsage: <code>3 <= 4',
  '': '<=',
  apply(me, scope, word) {
   me.data.compareToPath.push(word)
  },
  begin(me, scope) {
   me.data.compareToPath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const compareToPath = me.data.compareToPath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const compareToValue = civil.get(scope, scope, compareToPath)
   me.data.focus = hand.some((handValue) => handValue <= compareToValue)
  },
 },

 '>=': {
  title: 'Greater than or equal to\nUsage: <code>4 >= 3',
  '': '>=',
  apply(me, scope, word) {
   me.data.compareToPath.push(word)
  },
  begin(me, scope) {
   me.data.compareToPath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const compareToPath = me.data.compareToPath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const compareToValue = civil.get(scope, scope, compareToPath)
   me.data.focus = hand.some((handValue) => handValue >= compareToValue)
  },
 },

 '*': {
  title: 'Multiply\nUsage: <code>4 * 3',
  '': '*',
  apply(me, scope, word) {
   me.data.basePath.push(word)
  },
  begin(me, scope) {
   me.data.basePath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const basePath = me.data.basePath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const baseValue = civil.get(scope, scope, basePath)
   me.data.focus = hand.reduce((product, handValue) => handValue * product, baseValue)
  },
 },

 '/': {
  title: 'Divide\nUsage: <code>4 / 3',
  '': '/',
  apply(me, scope, word) {
   me.data.basePath.push(word)
  },
  begin(me, scope) {
   me.data.basePath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const basePath = me.data.basePath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const baseValue = civil.get(scope, scope, basePath)
   me.data.focus = hand.reduce((product, handValue) => handValue / product, baseValue)
  },
 },

 '//': {
  title: 'Integer divide\nUsage: <code>4 // 3',
  '': '//',
  apply(me, scope, word) {
   me.data.basePath.push(word)
  },
  begin(me, scope) {
   me.data.basePath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const basePath = me.data.basePath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const baseValue = civil.get(scope, scope, basePath)
   me.data.focus = hand.reduce((product, handValue) => Math.floor(handValue / product), baseValue)
  },
 },

 '+': {
  title: 'Add\nUsage: <code>4 + 3',
  '': '+',
  apply(me, scope, word) {
   me.data.basePath.push(word)
  },
  begin(me, scope) {
   me.data.basePath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const basePath = me.data.basePath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const baseValue = civil.get(scope, scope, basePath)
   me.data.focus = hand.reduce((sum, handValue) => handValue + sum, baseValue)
  },
 },

 '-': {
  title: 'Subtract\nUsage: <code>4 - 3',
  '': '-',
  apply(me, scope, word) {
   me.data.basePath.push(word)
  },
  begin(me, scope) {
   me.data.basePath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const basePath = me.data.basePath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const baseValue = civil.get(scope, scope, basePath)
   me.data.focus = hand.reduce((sum, handValue) => handValue - sum, baseValue)
  },
 },

 '%': {
  title: 'Modulus\nUsage: <code>4 % 3',
  '': '%',
  apply(me, scope, word) {
   me.data.basePath.push(word)
  },
  begin(me, scope) {
   me.data.basePath = []
  },
  complete(me, scope) {
   const hand = me.data.hand.splice(0)
   const basePath = me.data.basePath.splice(0)
   if (hand.length === 0) {
    hand.push(me.data.focus)
   }
   const baseValue = civil.get(scope, scope, basePath)
   me.data.focus = hand.reduce((final, handValue) => handValue % final, baseValue)
  },
 },
}

