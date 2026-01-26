use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{atomic::{AtomicUsize, Ordering}, Mutex};
use std::time::{Duration, Instant};

static SERVICE_DAEMON: Lazy<ServiceDaemon> = Lazy::new(|| {
    ServiceDaemon::new().expect("Failed to create mDNS service daemon")
});
static ADVERTISEMENTS: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicUsize = AtomicUsize::new(1);

#[napi(object)]
#[derive(Clone, Debug)]
pub struct DiscoveryProperty {
    pub key: String,
    pub value: String,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct DiscoveredService {
    pub fullname: String,
    pub host: String,
    pub port: u16,
    pub addresses: Vec<String>,
    pub properties: Vec<DiscoveryProperty>,
}

#[napi]
pub fn start_advertisement(
    service_type: String,
    instance_name: String,
    port: u16,
    properties: Option<Vec<DiscoveryProperty>>,
) -> Result<String> {
    let host_name = format!("{}.local.", instance_name);
    let props = properties_to_map(properties);
    let info = ServiceInfo::new(&service_type, &instance_name, &host_name, "", port, props)
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))?
        .enable_addr_auto();
    let fullname = info.get_fullname().to_string();

    SERVICE_DAEMON
        .register(info)
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))?;

    let id = next_id("adv");
    let mut guard = ADVERTISEMENTS
        .lock()
        .map_err(|_| Error::new(Status::GenericFailure, "Failed to lock advertisements"))?;
    guard.insert(id.clone(), fullname);
    Ok(id)
}

#[napi]
pub fn stop_advertisement(advertisement_id: String) -> Result<bool> {
    let mut guard = ADVERTISEMENTS
        .lock()
        .map_err(|_| Error::new(Status::GenericFailure, "Failed to lock advertisements"))?;
    if let Some(fullname) = guard.remove(&advertisement_id) {
        let receiver = SERVICE_DAEMON
            .unregister(&fullname)
            .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))?;
        let _ = receiver.recv_timeout(Duration::from_millis(250));
        return Ok(true);
    }
    Ok(false)
}

#[napi]
pub fn browse_once(service_type: String, timeout_ms: u32) -> Result<Vec<DiscoveredService>> {
    let receiver = SERVICE_DAEMON
        .browse(&service_type)
        .map_err(|err| Error::new(Status::GenericFailure, err.to_string()))?;

    let mut results: HashMap<String, DiscoveredService> = HashMap::new();
    let timeout = Duration::from_millis(timeout_ms as u64);
    let start = Instant::now();

    loop {
        let elapsed = start.elapsed();
        if elapsed >= timeout {
            break;
        }
        let remaining = timeout.saturating_sub(elapsed);
        match receiver.recv_timeout(remaining) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let service = to_discovered_service(&info);
                results.insert(service.fullname.clone(), service);
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }

    let _ = SERVICE_DAEMON.stop_browse(&service_type);

    Ok(results.into_values().collect())
}

fn to_discovered_service(info: &ServiceInfo) -> DiscoveredService {
    let addresses = info
        .get_addresses()
        .iter()
        .map(|addr| addr.to_string())
        .collect();
    let properties = info
        .get_properties()
        .iter()
        .map(|prop| DiscoveryProperty {
            key: prop.key().to_string(),
            value: prop.val_str().to_string(),
        })
        .collect();

    DiscoveredService {
        fullname: info.get_fullname().to_string(),
        host: info.get_hostname().to_string(),
        port: info.get_port(),
        addresses,
        properties,
    }
}

fn properties_to_map(properties: Option<Vec<DiscoveryProperty>>) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Some(props) = properties {
        for entry in props {
            map.insert(entry.key, entry.value);
        }
    }
    map
}

fn next_id(prefix: &str) -> String {
    let next = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}", prefix, next)
}
