const minPasswordLength = 6;
var socket;
var userDataRetrieved = false;

const displayProperty = {
    block: "block",
    none: "none"
};

const localStorageKey = {
    token: "token",
    lastOpenedTab: "last-opened-tab",
};

const tabs = {
    home: "home-tab",
    account: "account-tab",
    browse: "browse-tab"
};

window.onload = function() {
    const tokenValue = localStorage.getItem(localStorageKey.token);

    if (typeof(tokenValue) != "string") {
        displayWelcomeView();
    }
    else {
        manageSocket();
        displayProfileView();
    }
};

window.addEventListener("beforeunload", function (e) {
    if (socket != undefined) {
        const tokenValue = localStorage.getItem(localStorageKey.token);
        socket.emit("handle-user-disconnected", {"data": tokenValue});
    }
});

//*** Views ***
var displayWelcomeView = function() {
    const body = document.getElementById("body");
    const welcomeView = document.getElementById("welcomeview");

    body.innerHTML = welcomeView.innerHTML;
}

var displayProfileView = function() {
    const lastTabValue = localStorage.getItem(localStorageKey.lastOpenedTab);
    const body = document.getElementById("body");
    const profileView = document.getElementById("profileview");

    body.innerHTML = profileView.innerHTML;

    if (lastTabValue == tabs.home) {
        displayHomeTab();
    }
    else if (lastTabValue == tabs.account) {
        displayAccountTab();
    }
    else if (lastTabValue == tabs.browse) {
        displayBrowseTab();
    }
    else {
        displayHomeTab();
    }
}

var displayRecoverPasswordView = function() {
    const body = document.getElementById("body");
    const recoverPasswordView = document.getElementById("recoverpasswordview");

    body.innerHTML = recoverPasswordView.innerHTML;
}

var displayStatusMessage = function(statusMessageElement, statusMessage, success) {

    if (statusMessageElement.style.display == displayProperty.block) {
        statusMessageElement.style.display = displayProperty.none;
    } 

    if (success) {
        statusMessageElement.classList.replace("error-message", "success-message");
    }
    else {
        statusMessageElement.classList.replace("success-message", "error-message");
    }

    statusMessageElement.style.display = displayProperty.block;
    statusMessageElement.textContent = statusMessage;
}

//*** Account ***
var signIn = function(signInFormData) {
    const emailString = signInFormData.signInEmail.value;
    const passwordString = signInFormData.signInPassword.value;
    const statusMessageElement = document.getElementById("status-message");

    if (!isPasswordLengthCorrect(passwordString)) {
        displayStatusMessage(
            statusMessageElement,
            `Incorrect password length, allowed min length = ${minPasswordLength}`,
            false
        );

        return;
    }

    const credentials = {
        email: emailString,
        password: passwordString
    };

    const signInRequest = new XMLHttpRequest();

    signInRequest.open("POST", "/sign-in", true)
    signInRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    signInRequest.onreadystatechange = function() {
        if (signInRequest.readyState == 4) {
            if (signInRequest.status == 201) {
                const jsonResponse = JSON.parse(signInRequest.responseText);

                localStorage.setItem(localStorageKey.token, jsonResponse.token);
                loggedInUserEmail = credentials.email;

                manageSocket();
                displayProfileView();
            }
            else if (signInRequest.status == 400) {
                displayStatusMessage(
                    statusMessageElement,
                    "Missing credentials",
                    false
                );
            }
            else if (signInRequest.status == 404) {
                displayStatusMessage(
                    statusMessageElement,
                    "User not found",
                    false
                );
            }
            else if (signInRequest.status == 401) {
                displayStatusMessage(
                    statusMessageElement,
                    "Incorrect credentials",
                    false
                );
            }
            else if (signInRequest.status == 500) {
                displayStatusMessage(
                    statusMessageElement,
                    "Unexpected error, try again",
                    false
                );
            }
            else {
                displayStatusMessage(
                    statusMessageElement,
                    "Unexpected error, try again",
                    false
                );
            }
        }
    }
    signInRequest.send(JSON.stringify(credentials));
}

var signUp = function(signUpFormData) {
    const passwordString = signUpFormData.signUpPassword.value;
    const repeatedPasswordString = signUpFormData.repeatedSignUpPassword.value;
    const statusMessageElement = document.getElementById("status-message");

    if (!(passwordString == repeatedPasswordString)) {
        displayStatusMessage(
            statusMessageElement,
            "Password and the repeated password are not the same",
            false
        );

        return;
    }
    else if (!isPasswordLengthCorrect(passwordString) || !isPasswordLengthCorrect(repeatedPasswordString)) {
        displayStatusMessage(
            statusMessageElement,
            `Incorrect password length, allowed min length = ${minPasswordLength}`,
            false
        );

        return;
    }

    const userDataObject = {
        email: signUpFormData.signUpEmail.value,
        password: signUpFormData.signUpPassword.value,
        firstname: signUpFormData.firstName.value,
        familyname: signUpFormData.familyName.value,
        gender: signUpFormData.gender.value,
        city: signUpFormData.city.value,
        country: signUpFormData.country.value,
        current_location: null
    };

    const signUpRequest = new XMLHttpRequest();

    signUpRequest.open("POST", "/sign-up", true);
    signUpRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    signUpRequest.onreadystatechange = function() {
        if (signUpRequest.readyState == 4) {
            if (signUpRequest.status == 201) {
                displayStatusMessage(
                    statusMessageElement,
                    `Account ${userDataObject.email} created successfully`,
                    true
                )

                document.getElementById("firstName").value = "";
                document.getElementById("familyName").value = "";
                document.getElementById("city").value = "";
                document.getElementById("country").value = "";
                document.getElementById("signUpEmail").value = "";
                document.getElementById("signUpPassword").value = "";
                document.getElementById("repeatedSignUpPassword").value = "";
            }
            else if (signUpRequest.status == 400) {
                displayStatusMessage(
                    statusMessageElement,
                    "Missing credentials",
                    false
                );               
            }
            else if (signUpRequest.status == 200) {
                displayStatusMessage(
                    statusMessageElement,
                    "User already exists",
                    false
                );       
            }
            else {
                displayStatusMessage(
                    statusMessageElement,
                    "Unexpected error, try again",
                    false
                );
            }
        }
    }
    signUpRequest.send(JSON.stringify(userDataObject));
}

var isPasswordLengthCorrect = function(passwordString) {
    if (passwordString.length < minPasswordLength) {
        return false;
    }

    return true;
}

var changePassword = function(changePasswordFormData) {
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const oldPassword = changePasswordFormData.oldPassword.value;
    const newPassword = changePasswordFormData.newPassword.value; 
    const repeatedNewPassword = changePasswordFormData.repeatedNewPassword.value;
    const accountTabStatusMessageElement = document.getElementById("account-tab-status-message");

    if (!isPasswordLengthCorrect(oldPassword) ||
        !isPasswordLengthCorrect(newPassword) ||
        !isPasswordLengthCorrect(repeatedNewPassword)) {

        displayStatusMessage(
            accountTabStatusMessageElement,
            `Incorrect password length, allowed min length = ${minPasswordLength}`,
            false
        );

        return;
    }

    if (newPassword != repeatedNewPassword) {
        displayStatusMessage(
            accountTabStatusMessageElement,
            "New password and the repeated password are not the same",
            false
        );

        return;
    }

    const passwords = {
        old_password: oldPassword,
        new_password: newPassword
    };

    const changePasswordRequest = new XMLHttpRequest();

    changePasswordRequest.open("PUT", "/change-password", true);
    changePasswordRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    changePasswordRequest.setRequestHeader("token", tokenValue);
    changePasswordRequest.onreadystatechange = function() {
        if (changePasswordRequest.readyState == 4) {
            if (changePasswordRequest.status == 200) {
                displayStatusMessage(
                    accountTabStatusMessageElement,
                    "Password changed successfully",
                    true
                );
            }
            else if (changePasswordRequest.status == 400) {
                displayStatusMessage(
                    accountTabStatusMessageElement,
                    "Missing input",
                    false
                );
            }
            else if (changePasswordRequest.status == 401) {
                displayStatusMessage(
                    accountTabStatusMessageElement,
                    "You are not logged in, try to sign in again",
                    false
                );
            }
            else if (changePasswordRequest.status == 404) {
                displayStatusMessage(
                    accountTabStatusMessageElement,
                    "User not found, try to sign in again",
                    false
                );
            }
            else if (changePasswordRequest.status == 409) {
                displayStatusMessage(
                    accountTabStatusMessageElement,
                    "Incorrect password input(s): incorrect old password or the new password is the same as the old",
                    false
                );
            }
            else {
                displayStatusMessage(
                    accountTabStatusMessageElement,
                    "Password change error",
                    false
                );
            }
        }
    }
    changePasswordRequest.send(JSON.stringify(passwords));
}

var signOut = function(optionalMessage, optionalSuccess) {
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const signOutRequest = new XMLHttpRequest();

    signOutRequest.open("DELETE", "/sign-out", true);
    signOutRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    signOutRequest.setRequestHeader("token", tokenValue);
    signOutRequest.onreadystatechange = function() {
        if (signOutRequest.readyState == 4) {
            userDataRetrieved = false;
            socket.emit("handle-user-disconnected", {"data": tokenValue});
            clearLocalStorage();
            displayWelcomeView();

            if (signOutRequest.status == 200) {
                if (optionalMessage != undefined && optionalSuccess != undefined) {
                    const statusMessageElement = document.getElementById("status-message");

                    displayStatusMessage(
                        statusMessageElement,
                        optionalMessage,
                        optionalSuccess
                    );
                }
            }
            else if (signOutRequest.status == 401) {
                const statusMessageElement = document.getElementById("status-message");

                displayStatusMessage(
                    statusMessageElement,
                    "Other user signed in to your account",
                    false
                );
            }
            else if (signOutRequest.status == 500) {
                const statusMessageElement = document.getElementById("status-message");

                displayStatusMessage(
                    statusMessageElement,
                    "Signed out with unexpected error",
                    false
                );
            }
        }
    }
    signOutRequest.send();
}

//*** User Profile ***
var displayUserProfile = function() {
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const homeTabStatusMessageElement = document.getElementById("home-tab-status-message");
    const getUserDataRequest = new XMLHttpRequest();

    if (userDataRetrieved) {
        return;
    }
    
    getUserDataRequest.open("GET", "/get-user-data-by-token", true);
    getUserDataRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    getUserDataRequest.setRequestHeader("token", tokenValue);
    getUserDataRequest.onreadystatechange = function() {
        if (getUserDataRequest.readyState == 4) {
            if (getUserDataRequest.status == 200) {
                const userData = JSON.parse(getUserDataRequest.response);

                setCurrentUserLocation();
                document.getElementById("email-value").textContent = userData.data.email;
                document.getElementById("firstname-value").textContent = userData.data.firstname;
                document.getElementById("familyname-value").textContent = userData.data.familyname;
                document.getElementById("gender-value").textContent = userData.data.gender;
                document.getElementById("city-value").textContent = userData.data.city;
                document.getElementById("country-value").textContent = userData.data.country;
                document.getElementById("current-location-value").textContent =
                    userData.data.current_location != null ? userData.data.current_location : "-";
                
                userDataRetrieved = true;
                displayUserPostWall();
                return;
            }

            if (getUserDataRequest.status == 401){
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Authentication error - could not load user data",
                    false
                );
            }
            else if (getUserDataRequest.status = 404) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "User data not found",
                    false
                );
            }
            else if (getUserDataRequest.status == 500) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Unexpected error when loading user data",
                    false
                );
            }
        }
    }
    getUserDataRequest.send();
}
    
var displaySearchedUserProfile = function(browseFormDataObject) {
    const embeddedTab = document.getElementById("embedded-tab");
    const bottomBrowseTabStatusMessageElement = document.getElementById("browse-tab-bottom-status-message");
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const email = browseFormDataObject.searchedEmail.value;
    const getUserDataRequest = new XMLHttpRequest();

    getUserDataRequest.open("GET", "/get-user-data-by-email/" + email, true);
    getUserDataRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    getUserDataRequest.setRequestHeader("token", tokenValue);
    getUserDataRequest.onreadystatechange = function() {
        if (getUserDataRequest.readyState == 4) {
            if (getUserDataRequest.status == 200) {
                const userData = JSON.parse(getUserDataRequest.response);

                if (bottomBrowseTabStatusMessageElement.style.display == displayProperty.block) {
                    bottomBrowseTabStatusMessageElement.style.display = displayProperty.none;
                } 
                
                document.getElementById("searched-email-value").textContent = userData.data.email;
                document.getElementById("searched-firstname-value").textContent = userData.data.firstname;
                document.getElementById("searched-familyname-value").textContent = userData.data.familyname;
                document.getElementById("searched-gender-value").textContent = userData.data.gender;
                document.getElementById("searched-city-value").textContent = userData.data.city;
                document.getElementById("searched-country-value").textContent = userData.data.country;
                document.getElementById("searched-current-location-value").textContent =
                    userData.data.current_location != null ? userData.data.current_location : "-";
            
                embeddedTab.style.display = displayProperty.block;
                
                displaySearchedUserPostWall();
                return;
            }

            embeddedTab.style.display = displayProperty.none;

            if (getUserDataRequest.status == 401) {
                displayStatusMessage(
                    bottomBrowseTabStatusMessageElement,
                    "Authentication error, could not load user data",
                    false
                );
            }
            else if (getUserDataRequest.status == 404) {
                displayStatusMessage(
                    bottomBrowseTabStatusMessageElement,
                    "User not found",
                    false
                );
            }
            else if (getUserDataRequest.status == 500) {
                displayStatusMessage(
                    bottomBrowseTabStatusMessageElement,
                    "Unexpected error, could not load user data",
                    false
                );
            }
        }
    }
    getUserDataRequest.send();
}

//*** Post Wall ***
var postMessageToUserWall = async function() {
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const homeTabStatusMessageElement = document.getElementById("home-tab-status-message");
    const textArea = document.getElementById("text-area");

    const getUserDataRequest = new XMLHttpRequest();    
    getUserDataRequest.open("GET", "/get-user-data-by-token", true);
    getUserDataRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    getUserDataRequest.setRequestHeader("token", tokenValue);

    const getUserDataPromise = new Promise((resolve, reject) => {
        getUserDataRequest.onreadystatechange = function() {
            if (getUserDataRequest.readyState == 4) {
                if (getUserDataRequest.status == 200) {
                    const userData = JSON.parse(getUserDataRequest.response);
                    resolve(userData);
                } 
                else {
                    displayStatusMessage(
                        homeTabStatusMessageElement,
                        "Account data error",
                        false
                    );
    
                    reject(undefined);
                }
            }
        }
    });
  
    getUserDataRequest.send();

    const userData = await getUserDataPromise;

    const postMessageBody = {
        recipient: userData.data.email,
        content: textArea.value,
        writer_location: userData.data.current_location
    };

    const postMessageRequest = new XMLHttpRequest();
    postMessageRequest.open("POST", "/post-message", true);
    postMessageRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    postMessageRequest.setRequestHeader("token", tokenValue);
    postMessageRequest.onreadystatechange = function() {
        if (postMessageRequest.readyState == 4) {

            if (postMessageRequest.status == 201) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Message posted successfully",
                    true
                );

                setTimeout(()=> {
                    homeTabStatusMessageElement.style.display = displayProperty.none;
                }, 3000)

                textArea.value = "";
                displayUserPostWall();
            }
            else if (postMessageRequest.status == 401) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Authentication error - message not sent",
                    false
                );
            }
            else if (postMessageRequest.status == 400) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Message cannot be empty",
                    false
                );

                setTimeout(()=> {
                    homeTabStatusMessageElement.style.display = displayProperty.none;
                }, 3000)
            }
            else if (postMessageRequest.status == 404) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "User not found - message not sent",
                    false
                );
            }
            else if (postMessageRequest.status == 500) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Unexpected error - message not sent",
                    false
                );
            }
        }
    }
    postMessageRequest.send(JSON.stringify(postMessageBody));
}

var postMessageToSearchedUserWall = async function() {
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const textArea = document.getElementById("searched-text-area");
    const browseTabStatusMessageElement = document.getElementById("browse-tab-status-message");
    const email = document.getElementById("searchedEmail").value;

    const getUserDataRequest = new XMLHttpRequest();
    getUserDataRequest.open("GET", "/get-user-data-by-token", true);
    getUserDataRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    getUserDataRequest.setRequestHeader("token", tokenValue);

    const userCurrentLocation = new Promise((resolve, reject) => {
        getUserDataRequest.onreadystatechange = function() {
            if (getUserDataRequest.readyState == 4) {
                if (getUserDataRequest.status == 200) {
                    const response = JSON.parse(getUserDataRequest.response);

                    resolve(`${response.data.current_location}`);
                }
                else {
                    reject(null);
                }
            }
        }
    });

    getUserDataRequest.send();

    const postMessageBody = {
        recipient: email,
        content: textArea.value,
        writer_location: await userCurrentLocation
    }

    const postMessageRequest = new XMLHttpRequest();
    postMessageRequest.open("POST", "/post-message", true);
    postMessageRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    postMessageRequest.setRequestHeader("token", tokenValue);
    postMessageRequest.onreadystatechange = function() {
        if (postMessageRequest.readyState == 4) {

            if (postMessageRequest.status == 201) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "Message posted successfully",
                    true
                );

                setTimeout(()=> {
                    browseTabStatusMessageElement.style.display = displayProperty.none;
                }, 3000)

                textArea.value = "";
                displaySearchedUserPostWall();
            }
            else if (postMessageRequest.status == 401) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "Authentication error - message not sent",
                    false
                );
            }
            else if (postMessageRequest.status == 400) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "Message cannot be empty",
                    false
                );

                setTimeout(()=> {
                    browseTabStatusMessageElement.style.display = displayProperty.none;
                }, 3000)
            }
            else if (postMessageRequest.status == 404) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "User not found - message not sent",
                    false
                );
            }
            else if (postMessageRequest.status == 500) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "Unexpected error - message not sent",
                    false
                );
            }
        }
    }
    postMessageRequest.send(JSON.stringify(postMessageBody));
}

var displayUserPostWall = function() {
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const homeTabStatusMessageElement = document.getElementById("home-tab-status-message");
    const postWall = document.getElementById("post-wall");
    
    const getUserMessagesRequest = new XMLHttpRequest();

    getUserMessagesRequest.open("GET", "/get-user-messages-by-token", true);
    getUserMessagesRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    getUserMessagesRequest.setRequestHeader("token", tokenValue);
    getUserMessagesRequest.onreadystatechange = function() {
        if (getUserMessagesRequest.readyState == 4) {
            if (getUserMessagesRequest.status == 200) {
                const response = JSON.parse(getUserMessagesRequest.response);

                postWall.innerHTML = "";

                for (let i = response.messages.length - 1; i >= 0 ; i--) {
                    if (response.messages[i].writer_location == undefined) {
                        postWall.innerHTML +=
                        `<br><b><div style="color:red">${response.messages[i].writer}</div></b></div>${response.messages[i].content}<br>`;
                    }
                    else {
                        postWall.innerHTML +=
                        `<br><b><div style="color:red">${response.messages[i].writer}</div></b>
                         <b><div style="color:green">${response.messages[i].writer_location}</b></div>${response.messages[i].content}<br>`;
                    }
                }
            }
            else if (getUserMessagesRequest.status == 401) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Authentication error - messages could not be displayed",
                    false
                );
            }
            else if (getUserMessagesRequest.status == 404) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "No messages to display",
                    true
                );
            }
            else if (getUserMessagesRequest.status == 500) {
                displayStatusMessage(
                    homeTabStatusMessageElement,
                    "Unexpected error - messages could not be displayed",
                    true
                );
            }
        }
    }
    getUserMessagesRequest.send();
}

var displaySearchedUserPostWall = function() {
    const tokenValue = localStorage.getItem(localStorageKey.token);
    const email = document.getElementById("searchedEmail").value;
    const browseTabStatusMessageElement = document.getElementById("browse-tab-status-message");
    const postWall = document.getElementById("searched-post-wall");
    const getUserMessagesRequest = new XMLHttpRequest();

    getUserMessagesRequest.open("GET", "/get-user-messages-by-email/" + email, true);
    getUserMessagesRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    getUserMessagesRequest.setRequestHeader("token", tokenValue);
    getUserMessagesRequest.onreadystatechange = function() {
        if (getUserMessagesRequest.readyState == 4) {
            if (getUserMessagesRequest.status == 200) {
                const response = JSON.parse(getUserMessagesRequest.response);

                postWall.innerHTML = "";

                for (let i = response.messages.length - 1; i >= 0 ; i--) {
                    if (response.messages[i].writer_location == undefined) {
                        postWall.innerHTML +=
                        `<br><b><div style="color:red">${response.messages[i].writer}</div></b></div>${response.messages[i].content}<br>`;
                    }
                    else {
                        postWall.innerHTML +=
                        `<br><b><div style="color:red">${response.messages[i].writer}</div>
                         <b><div style="color:green">${response.messages[i].writer_location}</b></div>${response.messages[i].content}<br>`;
                    }
                }
                return;
            }

            postWall.innerHTML = "";

            if (getUserMessagesRequest.status == 401) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "Authentication error - messages could not be displayed",
                    false
                );
            }
            else if (getUserMessagesRequest.status == 404) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "No messages to display",
                    true
                );
            }
            else if (getUserMessagesRequest.status == 500) {
                displayStatusMessage(
                    browseTabStatusMessageElement,
                    "Unexpected error - messages could not be displayed",
                    true
                );
            }
        }
    }
    getUserMessagesRequest.send();
}

//*** Tabs ***
var displayHomeTab = function() {
    const homeTab = document.getElementById("home-tab");

    clearTabs();
    setActiveButton(tabs.home);
    setLocalStorageValue(localStorageKey.lastOpenedTab, tabs.home);

    homeTab.style.display = displayProperty.block;

    displayUserProfile();
}
    
var displayAccountTab = function() {
    const accountTab = document.getElementById("account-tab");

    clearTabs();
    setActiveButton(tabs.account);
    setLocalStorageValue(localStorageKey.lastOpenedTab, tabs.account);

    accountTab.style.display = displayProperty.block;
}
    
var displayBrowseTab = function() {
    const browseTab = document.getElementById("browse-tab");

    clearTabs();
    setActiveButton(tabs.browse);
    setLocalStorageValue(localStorageKey.lastOpenedTab, tabs.browse);

    browseTab.style.display = displayProperty.block;
}
    
var clearTabs = function() {
    const homeTab = document.getElementById("home-tab");

    if (homeTab.style.display == displayProperty.block) {
        homeTab.style.display = displayProperty.none;
        return;
    }

    const accountTab = document.getElementById("account-tab");

    if (accountTab.style.display == displayProperty.block) {
        accountTab.style.display = displayProperty.none;
        return;
    }

    const browseTab = document.getElementById("browse-tab");

    if (browseTab.style.display == displayProperty.block) {
        browseTab.style.display = displayProperty.none;
        return;
    }
}

var setActiveButton = function(tabName) {
    const homeButton = document.getElementById("btn-home-tab");
    const accountButton = document.getElementById("btn-account-tab");
    const browseButton = document.getElementById("btn-browse-tab");
    const blueColor = "#22c0f4";
    const limeColor = "#53e058";

    homeButton.style.backgroundColor = blueColor;
    accountButton.style.backgroundColor = blueColor;
    browseButton.style.backgroundColor = blueColor;

    if (tabName == tabs.home) {
        homeButton.style.backgroundColor = limeColor;
    }
    else if (tabName == tabs.account) {
        accountButton.style.backgroundColor = limeColor;
    }
    else if (tabName == tabs.browse) {
        browseButton.style.backgroundColor = limeColor;
    }
    else {
        homeButton.style.backgroundColor = limeColor;
    }
}

//*** Local storage ***
var setLocalStorageValue = function(key, stringValue) {
    localStorage.removeItem(key);
    localStorage.setItem(key, stringValue);
}

var clearLocalStorage = function() {
    localStorage.removeItem(localStorageKey.token);
    localStorage.removeItem(localStorageKey.lastOpenedTab);
}

//*** Web socket ***
var manageSocket = function() {
    const tokenValue = localStorage.getItem(localStorageKey.token);

    socket = io.connect('http://localhost:5000');

    socket.on('close-connection', function(msg) {
        signOut(msg.data, false);
    });

    socket.on('acknowledge-connection', function() {
        socket.emit('handle-user-connected', {"data": tokenValue})
    });
}

var recoverPassword = function() {
    const recoverEmail = document.getElementById("recover-email")
    const recoverPasswordStatusMessage = document.getElementById("recover-password-status-message")

    displayStatusMessage(
        recoverPasswordStatusMessage,
        "Processing the request...",
        true
    );

    const recoverPasswordRequest = new XMLHttpRequest()
    recoverPasswordRequest.open("GET", "/recover-password-via-email/" + recoverEmail.value, true);
    recoverPasswordRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    recoverPasswordRequest.onreadystatechange = function() {
        if (recoverPasswordRequest.readyState == 4) {
            if (recoverPasswordRequest.status == 200) {
                displayStatusMessage(
                    recoverPasswordStatusMessage,
                    "Password successfully delivered to e-mail " + recoverEmail.value,
                    true
                );
                recoverEmail.value = ""
            }
            else if (recoverPasswordRequest.status == 404) {
                displayStatusMessage(
                    recoverPasswordStatusMessage,
                    "User not found",
                    false
                );
            }
            else if (recoverPasswordRequest.status == 500) {
                displayStatusMessage(
                    recoverPasswordStatusMessage,
                    "Unexpected error, try again",
                    false
                );
            }
        }
    }
    recoverPasswordRequest.send();
}

var setCurrentUserLocation = async function() {
    try {
        const position = await new Promise((resolve, reject) => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            } else {
                reject({latitude: undefined, longitude: undefined});
            }
        });
    
        const tokenValue = localStorage.getItem(localStorageKey.token);
    
        const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        }
    
        if (coords.latitude == undefined || coords.longitude == undefined) {
            return;
        }
    
        const getLocationNameRequest = new XMLHttpRequest();
        getLocationNameRequest.open("GET", "/get-location-name/" + coords.latitude + "/" + coords.longitude, true);
        getLocationNameRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        getLocationNameRequest.setRequestHeader("token", tokenValue);
    
        const getLocationNamePromise = new Promise((resolve, reject) => {
            getLocationNameRequest.onreadystatechange = function() {
                if (getLocationNameRequest.readyState == 4) {
                    if (getLocationNameRequest.status == 200) {
                        const response = JSON.parse(getLocationNameRequest.response);
    
                        resolve(`${response.country}, ${response.city}`);
                    }
                    else if (getLocationNameRequest.status == 401) {
                        reject(null);
                    }
                    else if (getLocationNameRequest.status == 500) {
                        reject(null);
                    }
                }
            }
        });
    
        getLocationNameRequest.send();
    
        const currentLocationName = await getLocationNamePromise;
    
        const requestBody = {
            current_location: currentLocationName
        }
    
        const setUserCurrentLocationRequest = new XMLHttpRequest();
        setUserCurrentLocationRequest.open("POST", "/set-user-location", true);
        setUserCurrentLocationRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        setUserCurrentLocationRequest.setRequestHeader("token", tokenValue);
        setUserCurrentLocationRequest.send(JSON.stringify(requestBody));
    }
    catch(error) {}
}

var removeCurrentUserLocation = function() {
    const tokenValue = localStorage.getItem(localStorageKey);
    const requestBody = {
        current_location: null
    }

    const setUserCurrentLocationRequest = new XMLHttpRequest();
    setUserCurrentLocationRequest.open("POST", "/set-user-location", true);
    setUserCurrentLocationRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    setUserCurrentLocationRequest.setRequestHeader("token", tokenValue);
    setUserCurrentLocationRequest.send(JSON.stringify(requestBody));
}
