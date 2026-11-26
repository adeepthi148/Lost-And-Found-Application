
let signup = false;

function toggle() {
    signup = !signup;

    document.getElementById("title").textContent =
        signup ? "Create Account" : "Login";

    document.querySelector("button").textContent =
        signup ? "Sign Up" : "Login";

    document.getElementById("switch").innerHTML = signup
        ? 'Already registered? <a href="#" onclick="toggle()">Login</a>'
        : 'New user? <a href="#" onclick="toggle()">Create Account</a>';

    document.getElementById("msg").textContent = "";
}

document.getElementById("form").onsubmit = function(e) {
    e.preventDefault();

    let email = document.getElementById("email").value;
    let pass = document.getElementById("password").value;

    let users = JSON.parse(localStorage.getItem("users") || "{}");
    let msg = document.getElementById("msg");

    if (signup) {

        if (users[email]) {
            msg.style.color = "red";
            msg.textContent = "Account already exists!";
        } else {
            users[email] = pass;
            localStorage.setItem("users", JSON.stringify(users));

            msg.style.color = "green";
            msg.textContent = "Account created! Please login.";

            toggle();
        }

    } else if (users[email] && users[email] === pass) {

        // Directly open dashboard without popup
        window.location.href = "dashboard.html";

    } else {
        msg.style.color = "red";
        msg.textContent = "Invalid email or password!";
    }
};
