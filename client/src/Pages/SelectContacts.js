import React, { useContext, useEffect, useState } from "react";
import { UserContext } from "../Components/UserContext";
import { useNavigate } from "react-router-dom";
import "./CSS/SelectContacts.css";

export default function SelectContacts() {
  const { userEmail } = useContext(UserContext);
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const Navigate = useNavigate();

  useEffect(() => {
    async function fetchContacts() {
      console.log(userEmail);
      try {
        await fetch("http://localhost:4000/select-contacts", {
          method: "POST",
          body: JSON.stringify({ email: userEmail }),
          headers: { "Content-type": "application/json" },
          credentials: "include",
        })
          .then((res) => res.json())
          .then((data) => {
            console.log("received data: ", data);
            // const sortedContacts = data.sort();
            setContacts(data);
          });
      } catch (err) {
        console.log("error:", err);
      }
    }
    fetchContacts();
  }, [userEmail]);

  function handleCheckboxChange(index) {
    setSelectedContacts((prevSelected) => {
      const updatedSelections = prevSelected.includes(index)
        ? prevSelected.filter((idx) => idx !== index)
        : [...prevSelected, index];

      showSelections(updatedSelections);
      return updatedSelections;
    });
  }

  function showSelections(updatedContacts) {
    console.log(updatedContacts);
  }

  async function handleOnSubmit(ev) {
    ev.preventDefault();
    console.log("submit");
    try {
      const response = await fetch("http://localhost:4000/send-contacts", {
        method: "POST",
        body: JSON.stringify({
          selectedContacts: selectedContacts,
          email: userEmail,
        }),
        headers: { "Content-type": "application/json" },
        credentials: "include",
      });

      const data = await response.json();
      console.log(data);
      const post_id = data.post_id;
      if (response.ok) Navigate(`/events/event-info/${post_id}`);
    } catch (err) {
      console.log("Error while posting selected contacts: ", err);
    }
  }

  return (
    <div className="select-contacts">
      <p className="p-select">Select Contacts</p>
      <form className="ejkfh" onSubmit={handleOnSubmit}>
        <button className="ieugfe" type="submit">
          Go Ahead
        </button>
        <ul className="weughew">
          {contacts.map((item, index) => (
            <li className="adjkfbaejk" key={index}>
              <label>
                <input
                  className="ejfbe"
                  type="checkbox"
                  onChange={() => {
                    handleCheckboxChange(index);
                  }}
                />
                {item}
              </label>
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}
