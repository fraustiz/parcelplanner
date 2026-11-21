"""Prints a Blueprint's bytecode as readable pseudo-code.

The game's hardcoded numbers (chances, delivery timers, cargo weights) live in Blueprint
functions, not in data tables. `Program.cs dump` writes them as Kismet expression trees; this
turns each function into one line per statement.

    python kismet.py <package.json> [function-name-regex]

Unknown expression kinds print as <EX_Name {...}> rather than being dropped.
"""
import json,sys,re
def nm(o):
    if o is None: return 'null'
    if isinstance(o,dict):
        if 'Property' in o and isinstance(o['Property'],dict): return o['Property'].get('Name','?')
        if 'ObjectName' in o: return re.sub(r"^.*?'(.*)'$",r'\1',o['ObjectName']).split(':')[-1]
        if 'Name' in o: return o['Name']
        if 'Path' in o: p=o['Path']; return (p[-1].get('Name','?') if isinstance(p[-1],dict) else str(p[-1])) if p else '?'
    return str(o)
def var(v):
    if isinstance(v,dict) and 'Variable' in v: return nm(v['Variable'])
    return nm(v)
def e(x):
    if x is None: return ''
    if not isinstance(x,dict): return str(x)
    t=x.get('Token','?')
    if t in('EX_LocalVariable','EX_InstanceVariable','EX_LocalOutVariable','EX_DefaultVariable'): return var(x)
    if t in('EX_FloatConst','EX_DoubleConst','EX_IntConst','EX_ByteConst','EX_Int64Const','EX_IntConstByte'): return str(x.get('Value'))
    if t=='EX_NameConst': return repr(x.get('Value'))
    if t in('EX_StringConst','EX_UnicodeStringConst'): return repr(x.get('Value'))
    if t=='EX_TextConst': return 'TEXT('+json.dumps(x.get('Value',''))[:60]+')'
    if t=='EX_True': return 'true'
    if t=='EX_False': return 'false'
    if t=='EX_Self': return 'self'
    if t in('EX_NoObject','EX_Nothing','EX_NoInterface'): return 'none'
    if t=='EX_ObjectConst': return nm(x.get('Value'))
    if t in('EX_Let','EX_LetBool','EX_LetObj','EX_LetWeakObjPtr','EX_LetDelegate','EX_LetMulticastDelegate','EX_LetValueOnPersistentFrame'):
        return f"{e(x.get('Variable')) if isinstance(x.get('Variable'),dict) and 'Token' in x['Variable'] else var(x.get('Variable')) if 'Variable' in x else nm(x.get('Property'))} = {e(x.get('Expression') or x.get('Assignment'))}"
    if t in('EX_CallMath','EX_FinalFunction','EX_VirtualFunction','EX_LocalFinalFunction','EX_LocalVirtualFunction','EX_CallMulticastDelegate'):
        f=nm(x.get('Function') or x.get('StackNode')) if ('Function' in x or 'StackNode' in x) else x.get('VirtualFunctionName',x.get('FunctionName','?'))
        if isinstance(f,dict): f=nm(f)
        return f"{f}({', '.join(e(p) for p in x.get('Parameters',[]))})"
    if t=='EX_Context' or t=='EX_Context_FailSilent': return f"{e(x.get('ObjectExpression'))}.{e(x.get('ContextExpression'))}"
    if t=='EX_StructMemberContext': return f"{e(x.get('StructExpression'))}.{nm(x.get('Property'))}"
    if t in('EX_InterfaceContext',): return e(x.get('InterfaceValue'))
    if t in('EX_Jump',): return f"goto {x.get('CodeOffset')}"
    if t=='EX_JumpIfNot': return f"if not ({e(x.get('BooleanExpression'))}) goto {x.get('CodeOffset')}"
    if t=='EX_PushExecutionFlow': return f"push {x.get('PushingAddress')}"
    if t=='EX_PopExecutionFlow': return 'pop'
    if t=='EX_PopExecutionFlowIfNot': return f"pop if not ({e(x.get('BooleanExpression'))})"
    if t=='EX_Return': return f"return {e(x.get('ReturnExpression'))}"
    if t=='EX_SwitchValue': return f"switch({e(x.get('IndexTerm'))}){{"+'; '.join(f"{e(c.get('CaseIndexValueTerm'))}: {e(c.get('CaseTerm'))}" for c in x.get('Cases',[]))+f"; default: {e(x.get('DefaultTerm'))}}}"
    if t in('EX_SetArray','EX_SetSet','EX_SetMap'): return f"{e(x.get('AssigningProperty') or x.get('MapProperty') or x.get('SetProperty'))} = [{', '.join(e(p) for p in x.get('Elements',[]))}]"
    if t in('EX_ArrayConst','EX_SetConst','EX_MapConst'): return f"[{', '.join(e(p) for p in x.get('Elements',[]))}]"
    if t=='EX_StructConst': return f"{nm(x.get('Struct'))}{{{', '.join(e(p) for p in x.get('Properties',x.get('Value',[])))}}}"
    if t in('EX_Cast','EX_PrimitiveCast','EX_DynamicCast','EX_MetaCast','EX_ObjToInterfaceCast','EX_CrossInterfaceCast','EX_InterfaceToObjCast'): return f"cast({e(x.get('Target') or x.get('ExpressionToCast') or x.get('Expression'))})"
    if t=='EX_ArrayGetByRef': return f"{e(x.get('ArrayVariable'))}[{e(x.get('ArrayIndex'))}]"
    if t=='EX_BindDelegate': return f"bind {x.get('FunctionName')}"
    if t in('EX_EndOfScript','EX_Tracepoint','EX_WireTracepoint','EX_InstrumentationEvent'): return ''
    if t=='EX_ComputedJump': return f"goto [{e(x.get('CodeOffsetExpression'))}]"
    rest={k:v for k,v in x.items() if k not in('Token','StatementIndex')}
    return f"<{t} {json.dumps(rest)[:200]}>"
d=json.load(open(sys.argv[1],encoding='utf-8'))
pat=re.compile(sys.argv[2]) if len(sys.argv)>2 else None
for f in d:
    if 'ScriptBytecode' not in f: continue
    if pat and not pat.search(f['Name']): continue
    print(f"\n### {f['Name']}")
    for s in f['ScriptBytecode']:
        line=e(s)
        if line: print(f"  {s.get('StatementIndex'):>6}: {line}")
