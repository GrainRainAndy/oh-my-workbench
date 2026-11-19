#include <Carbon/Carbon.h>
#include <node_api.h>
#include <map>

struct Binding {
  EventHotKeyRef hotkey;
  napi_threadsafe_function callback;
};
static std::map<UInt32, Binding> bindings;
static EventHandlerRef handler;
static UInt32 nextId = 1;
static constexpr OSType signature = 'OMWB';

static OSStatus pressed(EventHandlerCallRef, EventRef event, void*) {
  EventHotKeyID key;
  if (GetEventParameter(event, kEventParamDirectObject, typeEventHotKeyID,
                        nullptr, sizeof(key), nullptr, &key) != noErr ||
      key.signature != signature) return eventNotHandledErr;
  auto found = bindings.find(key.id);
  if (found == bindings.end()) return eventNotHandledErr;
  napi_call_threadsafe_function(found->second.callback, nullptr, napi_tsfn_nonblocking);
  return noErr;
}

static void removeBinding(UInt32 id) {
  auto found = bindings.find(id);
  if (found == bindings.end()) return;
  UnregisterEventHotKey(found->second.hotkey);
  napi_release_threadsafe_function(found->second.callback, napi_tsfn_abort);
  bindings.erase(found);
}

static void cleanup(void*) {
  while (!bindings.empty()) removeBinding(bindings.begin()->first);
  if (handler) RemoveEventHandler(handler);
  handler = nullptr;
}

static napi_value bindKey(napi_env env, napi_callback_info info) {
  napi_value args[3], name, result;
  size_t count = 3;
  uint32_t code, modifiers;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 3 || napi_get_value_uint32(env,args[0],&code) != napi_ok ||
      napi_get_value_uint32(env,args[1],&modifiers) != napi_ok) {
    napi_throw_type_error(env,nullptr,"Invalid shortcut");
    return nullptr;
  }
  EventHotKeyID key = {signature,nextId++};
  EventHotKeyRef ref;
  UInt32 registered = 0;
  if (handler && RegisterEventHotKey(code,modifiers,key,GetApplicationEventTarget(),
                                     kEventHotKeyExclusive,&ref) == noErr) {
    napi_threadsafe_function callback;
    napi_create_string_utf8(env,"workspace shortcut",NAPI_AUTO_LENGTH,&name);
    if (napi_create_threadsafe_function(env,args[2],nullptr,name,1,1,nullptr,nullptr,
                                        nullptr,nullptr,&callback) == napi_ok) {
      bindings.emplace(key.id,Binding{ref,callback});
      registered = key.id;
    } else UnregisterEventHotKey(ref);
  }
  napi_create_uint32(env,registered,&result);
  return result;
}

static napi_value unbindKey(napi_env env,napi_callback_info info) {
  size_t count = 1;
  napi_value arg;
  uint32_t id;
  napi_get_cb_info(env,info,&count,&arg,nullptr,nullptr);
  if (count == 1 && napi_get_value_uint32(env,arg,&id) == napi_ok) removeBinding(id);
  return nullptr;
}

NAPI_MODULE_INIT() {
  EventTypeSpec type = {kEventClassKeyboard,kEventHotKeyPressed};
  InstallApplicationEventHandler(pressed,1,&type,nullptr,&handler);
  napi_add_env_cleanup_hook(env,cleanup,nullptr);
  napi_property_descriptor methods[] = {
    {"bind",nullptr,bindKey,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"unbind",nullptr,unbindKey,nullptr,nullptr,nullptr,napi_default,nullptr}
  };
  napi_define_properties(env,exports,2,methods);
  return exports;
}
