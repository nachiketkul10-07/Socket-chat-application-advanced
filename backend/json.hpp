// json.hpp - Lightweight JSON parser/serializer for C++11
// Single-header minimal JSON library for chat server
#ifndef JSON_HPP
#define JSON_HPP

#include <string>
#include <map>
#include <vector>
#include <sstream>
#include <stdexcept>

class Json {
public:
    enum Type { NULL_TYPE, BOOL, NUMBER, STRING, ARRAY, OBJECT };
    
private:
    Type type_;
    bool boolVal_;
    double numberVal_;
    std::string stringVal_;
    std::vector<Json> arrayVal_;
    std::map<std::string, Json> objectVal_;
    
public:
    Json() : type_(NULL_TYPE), boolVal_(false), numberVal_(0) {}
    Json(bool b) : type_(BOOL), boolVal_(b), numberVal_(0) {}
    Json(int n) : type_(NUMBER), boolVal_(false), numberVal_(n) {}
    Json(double n) : type_(NUMBER), boolVal_(false), numberVal_(n) {}
    Json(const char* s) : type_(STRING), boolVal_(false), numberVal_(0), stringVal_(s) {}
    Json(const std::string& s) : type_(STRING), boolVal_(false), numberVal_(0), stringVal_(s) {}
    
    static Json object() { Json j; j.type_ = OBJECT; return j; }
    static Json array() { Json j; j.type_ = ARRAY; return j; }
    
    Type type() const { return type_; }
    bool isNull() const { return type_ == NULL_TYPE; }
    bool isBool() const { return type_ == BOOL; }
    bool isNumber() const { return type_ == NUMBER; }
    bool isString() const { return type_ == STRING; }
    bool isArray() const { return type_ == ARRAY; }
    bool isObject() const { return type_ == OBJECT; }
    
    bool asBool() const { return boolVal_; }
    int asInt() const { return static_cast<int>(numberVal_); }
    double asDouble() const { return numberVal_; }
    std::string asString() const { return stringVal_; }
    
    Json& operator[](const std::string& key) {
        if (type_ != OBJECT) type_ = OBJECT;
        return objectVal_[key];
    }
    
    const Json& operator[](const std::string& key) const {
        static Json nullJson;
        auto it = objectVal_.find(key);
        return it != objectVal_.end() ? it->second : nullJson;
    }
    
    void push_back(const Json& val) {
        if (type_ != ARRAY) type_ = ARRAY;
        arrayVal_.push_back(val);
    }
    
    size_t size() const {
        if (type_ == ARRAY) return arrayVal_.size();
        if (type_ == OBJECT) return objectVal_.size();
        return 0;
    }
    
    const Json& at(size_t idx) const {
        static Json nullJson;
        return idx < arrayVal_.size() ? arrayVal_[idx] : nullJson;
    }
    
    bool has(const std::string& key) const {
        return objectVal_.find(key) != objectVal_.end();
    }
    
    std::string serialize() const {
        std::ostringstream oss;
        serializeInternal(oss);
        return oss.str();
    }
    
    static Json parse(const std::string& str) {
        size_t pos = 0;
        return parseValue(str, pos);
    }
    
private:
    void serializeInternal(std::ostringstream& oss) const {
        switch (type_) {
            case NULL_TYPE:
                oss << "null";
                break;
            case BOOL:
                oss << (boolVal_ ? "true" : "false");
                break;
            case NUMBER:
                if (numberVal_ == static_cast<int>(numberVal_)) {
                    oss << static_cast<int>(numberVal_);
                } else {
                    oss << numberVal_;
                }
                break;
            case STRING:
                oss << '"';
                for (char c : stringVal_) {
                    if (c == '"' || c == '\\') oss << '\\';
                    oss << c;
                }
                oss << '"';
                break;
            case ARRAY:
                oss << '[';
                for (size_t i = 0; i < arrayVal_.size(); ++i) {
                    if (i > 0) oss << ',';
                    arrayVal_[i].serializeInternal(oss);
                }
                oss << ']';
                break;
            case OBJECT:
                oss << '{';
                bool first = true;
                for (const auto& pair : objectVal_) {
                    if (!first) oss << ',';
                    first = false;
                    oss << '"' << pair.first << "\":";
                    pair.second.serializeInternal(oss);
                }
                oss << '}';
                break;
        }
    }
    
    static void skipWhitespace(const std::string& str, size_t& pos) {
        while (pos < str.size() && (str[pos] == ' ' || str[pos] == '\t' || 
               str[pos] == '\n' || str[pos] == '\r')) {
            ++pos;
        }
    }
    
    static Json parseValue(const std::string& str, size_t& pos) {
        skipWhitespace(str, pos);
        if (pos >= str.size()) throw std::runtime_error("Unexpected end of JSON");
        
        char c = str[pos];
        if (c == '{') return parseObject(str, pos);
        if (c == '[') return parseArray(str, pos);
        if (c == '"') return parseString(str, pos);
        if (c == 't' || c == 'f') return parseBool(str, pos);
        if (c == 'n') return parseNull(str, pos);
        if (c == '-' || (c >= '0' && c <= '9')) return parseNumber(str, pos);
        
        throw std::runtime_error("Invalid JSON");
    }
    
    static Json parseObject(const std::string& str, size_t& pos) {
        Json obj = Json::object();
        ++pos; // skip '{'
        skipWhitespace(str, pos);
        
        if (pos < str.size() && str[pos] == '}') {
            ++pos;
            return obj;
        }
        
        while (pos < str.size()) {
            skipWhitespace(str, pos);
            if (str[pos] != '"') throw std::runtime_error("Expected string key");
            
            std::string key = parseString(str, pos).asString();
            skipWhitespace(str, pos);
            
            if (pos >= str.size() || str[pos] != ':') throw std::runtime_error("Expected ':'");
            ++pos;
            
            obj[key] = parseValue(str, pos);
            skipWhitespace(str, pos);
            
            if (pos >= str.size()) throw std::runtime_error("Unexpected end");
            if (str[pos] == '}') { ++pos; break; }
            if (str[pos] == ',') { ++pos; continue; }
            throw std::runtime_error("Expected ',' or '}'");
        }
        return obj;
    }
    
    static Json parseArray(const std::string& str, size_t& pos) {
        Json arr = Json::array();
        ++pos; // skip '['
        skipWhitespace(str, pos);
        
        if (pos < str.size() && str[pos] == ']') {
            ++pos;
            return arr;
        }
        
        while (pos < str.size()) {
            arr.push_back(parseValue(str, pos));
            skipWhitespace(str, pos);
            
            if (pos >= str.size()) throw std::runtime_error("Unexpected end");
            if (str[pos] == ']') { ++pos; break; }
            if (str[pos] == ',') { ++pos; continue; }
            throw std::runtime_error("Expected ',' or ']'");
        }
        return arr;
    }
    
    static Json parseString(const std::string& str, size_t& pos) {
        ++pos; // skip '"'
        std::string result;
        while (pos < str.size() && str[pos] != '"') {
            if (str[pos] == '\\' && pos + 1 < str.size()) {
                ++pos;
                char c = str[pos];
                if (c == 'n') result += '\n';
                else if (c == 't') result += '\t';
                else if (c == 'r') result += '\r';
                else result += c;
            } else {
                result += str[pos];
            }
            ++pos;
        }
        if (pos >= str.size()) throw std::runtime_error("Unterminated string");
        ++pos; // skip closing '"'
        return Json(result);
    }
    
    static Json parseNumber(const std::string& str, size_t& pos) {
        size_t start = pos;
        if (str[pos] == '-') ++pos;
        while (pos < str.size() && str[pos] >= '0' && str[pos] <= '9') ++pos;
        if (pos < str.size() && str[pos] == '.') {
            ++pos;
            while (pos < str.size() && str[pos] >= '0' && str[pos] <= '9') ++pos;
        }
        double val = std::stod(str.substr(start, pos - start));
        return Json(val);
    }
    
    static Json parseBool(const std::string& str, size_t& pos) {
        if (str.substr(pos, 4) == "true") {
            pos += 4;
            return Json(true);
        }
        if (str.substr(pos, 5) == "false") {
            pos += 5;
            return Json(false);
        }
        throw std::runtime_error("Invalid boolean");
    }
    
    static Json parseNull(const std::string& str, size_t& pos) {
        if (str.substr(pos, 4) == "null") {
            pos += 4;
            return Json();
        }
        throw std::runtime_error("Invalid null");
    }
};

#endif // JSON_HPP