{/*function requestNotificationPermission() {
    // First, check if the browser supports notifications
    if (!("Notification" in window)) {
        alert("This browser does not support desktop notification");
    }
    // Then, ask for permission
    else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            // If the permission is granted
            if (permission === "granted") {
                // Create a new notification
                new Notification("Hi there! This is a notification.");
            }
        });
    }
}

useEffect(() => {
    requestNotificationPermission();
}, []);
*/}