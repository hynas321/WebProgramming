from flask import Flask, request
from flask_socketio import SocketIO, disconnect, emit
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests
from requests.structures import CaseInsensitiveDict

import database_helper as db_helper
import json
import smtplib

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*')
active_websockets: list = []

@app.route("/", methods = ["GET"])
def root():
    return app.send_static_file("client.html"), 200

@app.teardown_request
def teardown(exception):
    db_helper.disconnect()

@socketio.on("connect")
def connect():
    emit('acknowledge-connection', {"data": "Connection opened"})

@socketio.on("handle-user-connected")
def handle_user_connection(msg):
    try: 
        tokenValue = msg["data"]

        if not tokenValue:
            emit("close-connection", {"data": "Connection authentication error"}, room=request.sid)
            disconnect()
            return

        logged_in_user_DAO = db_helper.LoggedInUserDAO()
        logged_in_user = logged_in_user_DAO.get_logged_in_user_by_token(tokenValue)
        logged_in_users: list

        if logged_in_user != db_helper.DatabaseOutput.NONE:
            logged_in_users = logged_in_user_DAO.get_all_logged_in_users_by_email(logged_in_user.email)

        if (not (logged_in_user is db_helper.DatabaseOutput.ERROR or logged_in_user is db_helper.DatabaseOutput.NONE)
            and len(logged_in_users) > 1):

            user_sid: str

            for logged_user in logged_in_users:
                for active_socket in active_websockets:
                    if logged_user["token"] == active_socket["token"]:
                        user_sid = active_socket["sid"]

                        logged_in_user_DAO.delete_logged_in_user_by_token(logged_user["token"])
                        active_websockets.remove(active_socket)
                        emit("close-connection", {"data": "New user logged in to your account"}, room=user_sid)

        active_websockets.append({"token": tokenValue, "sid": request.sid})
        newest_websocket = active_websockets[len(active_websockets) - 1]

        for active_socket in active_websockets:
            if active_socket != newest_websocket and active_socket["token"] == newest_websocket["token"]:
                active_websockets.remove(active_socket)

    except Exception as ex:
        print(ex)
        emit("close-connection", {"data": "Connection error"})

@socketio.on("handle-user-disconnected")
def handle_user_disconnected(msg):
    tokenValue = msg["data"]

    for active_socket in active_websockets:
        if active_socket["token"] == tokenValue:
            active_websockets.remove(active_socket)

@app.route("/sign-in", methods = ["POST"])
def sign_in():
    received_json = request.get_json()

    if ("email" not in received_json or "password" not in received_json
        or len(received_json) != 2):
        return "", 400

    input_manager = db_helper.InputManager()
    are_credentials_correct = input_manager.verify_credentials(received_json["email"], received_json["password"])

    if not are_credentials_correct:
        return "", 400

    user_DAO = db_helper.UserDAO()
    user = user_DAO.get_user_data_by_email(received_json["email"])

    if user is db_helper.DatabaseOutput.NONE:
        return "", 404

    if user is db_helper.DatabaseOutput.ERROR:
        return "", 500

    if user.password != received_json["password"]:
        return "", 401

    token_manager = db_helper.TokenManager()
    generated_token = token_manager.generate_token()

    logged_in_user = db_helper.LoggedInUser(generated_token, user.email)
    logged_in_user_DAO = db_helper.LoggedInUserDAO()
    is_logged_in_user_created = logged_in_user_DAO.create_logged_in_user(logged_in_user)

    if not is_logged_in_user_created:
        return "", 500

    return json.dumps({"token": generated_token}), 201

@app.route("/sign-up", methods = ["POST"])
def sign_up():
    received_json = request.get_json()

    if ("email" not in received_json or "password" not in received_json or
        "firstname" not in received_json or "familyname" not in received_json or
        "gender" not in received_json or "city" not in received_json or
        "country" not in received_json or len(received_json) != 7):

        return "", 400

    input_manager = db_helper.InputManager()
    are_credentials_correct = input_manager.verify_credentials(received_json["email"], received_json["password"])

    if not are_credentials_correct:
        return "", 400

    user = db_helper.User(
        received_json["email"],
        received_json["password"],
        received_json["firstname"],
        received_json["familyname"],
        received_json["gender"],
        received_json["city"],
        received_json["country"]
    )

    user_DAO = db_helper.UserDAO()
    is_user_created = user_DAO.create_user(user)

    if not is_user_created:
        return "", 200

    return "", 201

@app.route("/sign-out", methods=["DELETE"])
def sign_out():
    received_token = request.headers.get("token")

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401

    logged_in_user_DAO = db_helper.LoggedInUserDAO()
    is_logged_in_user_deleted: bool = logged_in_user_DAO.delete_logged_in_user_by_token(received_token)

    if not is_logged_in_user_deleted:
        return "", 500

    return "", 200

@app.route("/change-password", methods=["PUT"])
def change_password():
    received_token = request.headers.get("token")
    received_json = request.get_json()

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401

    if ("old_password" not in received_json or "new_password" not in received_json or
        len(received_json) != 2):
        return "", 400

    input_verifier = db_helper.InputManager()
    is_old_password_correct = input_verifier.verify_password_length(received_json["old_password"])
    is_new_password_correct = input_verifier.verify_password_length(received_json["new_password"])

    if not is_old_password_correct or not is_new_password_correct:
        return "", 400
    
    user_DAO = db_helper.UserDAO()
    user: db_helper.User = user_DAO.get_user_data_by_token(received_token)

    if user is db_helper.DatabaseOutput.NONE:
        return "", 404
    
    if user is db_helper.DatabaseOutput.ERROR:
        return "", 500

    if user.password != received_json["old_password"]:
        return "", 409

    if received_json["new_password"] == received_json["old_password"]:
        return "", 409

    is_password_changed: bool = user_DAO.change_user_password(user.email, received_json["new_password"])

    if not is_password_changed:
        return "", 500

    return "", 200

@app.route("/get-user-data-by-token", methods=["GET"])
def get_user_data_by_token():
    received_token = request.headers.get("token")

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401

    user_DAO = db_helper.UserDAO()
    user = user_DAO.get_user_data_by_token(received_token)

    if user is db_helper.DatabaseOutput.NONE:
        return "", 404

    if user is db_helper.DatabaseOutput.ERROR:
        return "", 500

    user_data_without_password: dict = {
        "email": user.email,
        "firstname": user.firstname,
        "familyname": user.familyname,
        "gender": user.gender,
        "city": user.city,
        "country": user.country
    }

    return json.dumps({"data": user_data_without_password}), 200

@app.route("/get-user-data-by-email/<email>", methods=["GET"])
def get_user_data_by_email(email: str):
    received_token = request.headers.get("token")

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401

    user_DAO = db_helper.UserDAO()
    user = user_DAO.get_user_data_by_email(email)

    if user is db_helper.DatabaseOutput.NONE:
        return "", 404

    if user is db_helper.DatabaseOutput.ERROR:
        return "", 500

    user_data_without_password: dict = {
        "email": user.email,
        "firstname": user.firstname,
        "familyname": user.familyname,
        "gender": user.gender,
        "city": user.city,
        "country": user.country
    }

    return json.dumps({"data": user_data_without_password}), 200

@app.route("/get-user-messages-by-token", methods=["GET"])
def get_user_messages_by_token():
    received_token = request.headers.get("token")

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401

    message_DAO = db_helper.MessageDao()
    messages = message_DAO.get_user_messages_by_token(received_token)

    if messages is db_helper.DatabaseOutput.NONE:
        return "", 404
    
    if messages is db_helper.DatabaseOutput.ERROR:
        return "", 500

    return json.dumps({"messages": messages}), 200

@app.route("/get-user-messages-by-email/<email>", methods=["GET"])
def get_user_messages_by_email(email: str):
    received_token = request.headers.get("token")

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401
    
    message_DAO = db_helper.MessageDao()
    messages = message_DAO.get_user_messages_by_email(email)

    if messages is db_helper.DatabaseOutput.NONE:
        return "", 404

    if messages is db_helper.DatabaseOutput.ERROR:
        return "", 500

    return json.dumps({"messages": messages}), 200

@app.route("/post-message", methods=["POST"])
def post_message():
    received_token = request.headers.get("token")
    received_json = request.get_json()

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401

    input_manager = db_helper.InputManager()
    input_manager.verify_string_not_empty(received_json["content"])

    if ("content" not in received_json or "recipient" not in received_json or
        "writer_location" not in received_json or len(received_json) != 3 or
        not input_manager.verify_string_not_empty(received_json["content"])):
        return "", 400

    user_DAO = db_helper.UserDAO()
    user = user_DAO.get_user_data_by_email(received_json["recipient"])

    if user is db_helper.DatabaseOutput.NONE:
        return "", 404

    if user is db_helper.DatabaseOutput.ERROR:
        return "", 500

    message_DAO = db_helper.MessageDao()
    message_DAO.add_message(received_token, received_json["content"], received_json["recipient"], received_json["writer_location"])

    return "", 201

@app.route("/recover-password-via-email/<email>", methods=["GET"])
def recover_password_via_email(email: str):
    user_DAO = db_helper.UserDAO()
    user = user_DAO.get_user_data_by_email(email)

    if user is db_helper.DatabaseOutput.NONE:
        return "", 404
    
    if user is db_helper.DatabaseOutput.ERROR:
        return "", 500
    
    token_manager = db_helper.TokenManager()
    generated_password = token_manager.generate_token()[0:16]
    
    try:
        smtp_server = "smtp.gmail.com"
        smtp_port = 587
        smtp_username = "twidder09@gmail.com"
        smtp_password = "rytvzxgrmyzhgygz"

        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_username, smtp_password)

        from_address = smtp_username
        to_address = email
        subject = "Twidder - password recovery"
        body = f"""
        <h2>Your newly generated password: {generated_password}</h2>
        <h3>You are free to change it in the account tab after signing in to your account :)</h3>
        <h3>
            Best regards,<br>
            Twidder support
        </h3>
        """

        message = MIMEMultipart()
        message['From'] = from_address
        message['To'] = to_address
        message['Subject'] = subject
        message.attach(MIMEText(body, "html"))

        is_password_changed = user_DAO.change_user_password(user.email, generated_password)

        if not is_password_changed:
            return "", 500

        server.sendmail(from_address, to_address, message.as_string())

        server.quit()
    except:
        return "", 500

    return "", 200

@app.route("/get-location-name/<latitude>/<longitude>", methods=["GET"])
def get_location_name(latitude: str, longitude: str):
    print("REQUEST")
    received_token = request.headers.get("token")

    token_manager = db_helper.TokenManager()
    is_token_correct = token_manager.verify_token(received_token)

    if received_token is None or not is_token_correct:
        return "", 401
    
    myAPIKey = "bf7fa01b2f0549bda7a3d044e2082845"
    reverseGeocodingUrl = f"https://api.geoapify.com/v1/geocode/reverse?lat={latitude}&lon={longitude}&apiKey={myAPIKey}"

    headers = CaseInsensitiveDict()
    headers["Accept"] = "application/json;charset=UTF-8"

    resp = requests.get(reverseGeocodingUrl, headers=headers)
    
    if resp.status_code != 200:
        return 500
    
    country_output = resp.json()["features"][0]["properties"]["country"]
    city_output = resp.json()["features"][0]["properties"]["city"]

    return  {"country": country_output, "city": city_output}, 200


if __name__ == "__main__":
    socketio.run(app, debug=True, port=5000)
