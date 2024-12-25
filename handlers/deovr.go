func handleDeoVRList(w http.ResponseWriter, r *http.Request) {
    data, err := ioutil.ReadFile("path/to/list.json")
    if err != nil {
        if os.IsNotExist(err) {
            w.WriteHeader(http.StatusNotFound)
            w.Header().Set("Content-Type", "application/json")
            json.NewEncoder(w).Encode(map[string]string{
                "error": "List file not found"
            })
            return
        }
        // Handle other errors
        w.WriteHeader(http.StatusInternalServerError)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.Write(data)
}
